import re
from textual.app import App, ComposeResult
from textual.widgets import (
    Header, Footer, Static, Button, TextArea, RadioSet, RadioButton
)
from textual.containers import Horizontal


def parse_dsl(dsl_code):
    tags, vars_, blocks = {}, {}, {}
    lines = dsl_code.splitlines()
    i, n = 0, len(lines)
    block_stack = []
    block_lines = []
    cur_block = None
    main_module = None
    while i < n:
        line = lines[i].strip()
        if not line or line.startswith('//'):
            i += 1
            continue
        m = re.match(r'tag\s+(\w+)\s*=\s*<(\w+):(\w+)>', line)
        if m:
            name, ns, val = m.groups()
            tags[name] = f"<{ns}:{val}>"
            i += 1; continue
        m = re.match(r'var\s+(\w+)\s*=\s*\'([^\']*)\'', line)
        if m:
            name, val = m.groups()
            vars_[name] = val
            i += 1; continue
        m = re.match(r'(\w+)\s*\{', line)
        if m:
            cur_block = m.group(1)
            block_lines = []
            block_stack.append((cur_block, block_lines))
            i += 1
            continue
        if line == '}':
            block_name, content = block_stack.pop()
            if block_stack: block_stack[-1][1].append({'name': block_name, 'content': content})
            else: blocks[block_name] = content
            i += 1; continue
        if block_stack:
            block_stack[-1][1].append(line)
            i += 1; continue
        m = re.match(r'#main-module\s*=\s*(.*)', line)
        if m:
            mm_parts = [p.strip() for p in m.group(1).strip().split('+')]
            main_module = mm_parts
            i += 1; continue
        i += 1
    if not main_module:
        raise Exception("No #main-module defined")
    return tags, vars_, blocks, main_module

def resolve_component(comp, tags, vars_, blocks):
    if comp in tags:
        return tags[comp]
    if comp in vars_:
        return vars_[comp]
    if comp in blocks:
        return expand_block(blocks[comp], tags, vars_, blocks)
    return comp

def expand_block(content, tags, vars_, blocks):
    result = []
    for line in content:
        if isinstance(line, dict):
            val = expand_block(line['content'], tags, vars_, blocks)
            result.append(val)
        elif isinstance(line, str):
            line = line.strip()
            if not line or line.startswith('//'): continue
            m = re.match(r'\.([A-Za-z_][A-Za-z_0-9]*)', line)
            if m and m.group(1) in tags:
                result.append(tags[m.group(1)]); continue
            m = re.match(r'<([^:]+:[^>]+)>', line)
            if m:
                result.append(m.group(0)); continue
            m = re.match(r'#([A-Za-z_][A-Za-z_0-9]*)', line)
            if m and m.group(1) in blocks:
                subblock = expand_block(blocks[m.group(1)], tags, vars_, blocks)
                result.append(subblock); continue
            result.append(line)
    return '\n'.join([res if isinstance(res, str) else str(res) for res in result])

def dsl_to_prompt_raw(dsl_code):
    tags, vars_, blocks, main_module = parse_dsl(dsl_code)
    chunks = []
    for comp in main_module:
        val = resolve_component(comp, tags, vars_, blocks)
        chunks.append(val)
    return '\n'.join(str(c) for c in chunks)

def dsl_to_prompt_mid(dsl_code):
    tags, vars_, blocks, main_module = parse_dsl(dsl_code)
    flat_used = set()
    def flat(val):
        if isinstance(val, str):
            v = val.replace("'", "").strip()
            if v and v not in flat_used:
                flat_used.add(v)
                return v
            return ''
        elif isinstance(val, list):
            vals = [flat(x) for x in val]
            return ' '.join([x for x in vals if x])
        elif isinstance(val, dict):
            return flat(val.values())
        return ''
    chunks = []
    for comp in main_module:
        val = resolve_component(comp, tags, vars_, blocks)
        chunks.append(flat(val))
    s = ' '.join([x for x in chunks if x])
    s = re.sub(r'\s+', ' ', s).strip()
    return s

def dsl_to_prompt_mini(dsl_code):
    tags, vars_, blocks, main_module = parse_dsl(dsl_code)
    tag_map = {}
    tcounter = 1
    for k in tags:
        tag_map[tags[k]] = f"${tcounter}"
        tcounter += 1
    flat_used = set()
    def flat(val):
        if isinstance(val, str):
            v = val.replace("'", "").strip()
            for old, new in tag_map.items():
                v = v.replace(old, new)
            v = re.sub(r'<[^>]+>', '', v)
            v = v.strip()
            if v and v not in flat_used:
                flat_used.add(v)
                return v
            return ''
        elif isinstance(val, list):
            vals = [flat(x) for x in val]
            return ' '.join([x for x in vals if x])
        elif isinstance(val, dict):
            return flat(val.values())
        return ''
    chunks = []
    for comp in main_module:
        val = resolve_component(comp, tags, vars_, blocks)
        chunks.append(flat(val))
    s = ' '.join([x for x in chunks if x])
    s = re.sub(r'\s+', ' ', s).strip()
    return s

# ------------- TUI ---------

class DslTUI(App):
    CSS_PATH = None
    last_level = "raw"

    def compose(self) -> ComposeResult:
        yield Header()
        yield Static("DSL ➜ Prompt-конвертер (стрелки: вверх/вниз/таб)")
        yield Static("Вставь DSL-код в поле ниже — ничего лишнего:")
        yield TextArea(id="dsl")
        yield RadioSet(
            RadioButton("RAW (нет оптимизации)", id="raw", value=True),
            RadioButton("MID (компактно)", id="mid"),
            RadioButton("MINI (максимум сжатия)", id="mini"),
            id="levels",
        )
        yield Horizontal(
            Button("▶ Конвертировать", id="convert"),
            Button("Выйти", id="exit"),
        )
        yield Static("Результат:", id="reslabel")
        yield TextArea(id="res", read_only=True)
        yield Footer()

    def on_button_pressed(self, event):
        if event.button.id == "convert":
            self.make_prompt()
        elif event.button.id == "exit":
            self.exit()

    def on_radio_set_changed(self, message):
        self.last_level = message.pressed.id

    def make_prompt(self):
        dsl = self.query_one("#dsl", TextArea).text
        level = self.last_level
        try:
            if level =="raw":
                text = dsl_to_prompt_raw(dsl)
            elif level=="mid":
                text = dsl_to_prompt_mid(dsl)
            elif level=="mini":
                text = dsl_to_prompt_mini(dsl)
            else:
                text = ""
            self.query_one("#res", TextArea).text = text
        except Exception as e:
            self.query_one("#res", TextArea).text = f"[ОШИБКА] {str(e)}"

if __name__ == "__main__":
    DslTUI().run()