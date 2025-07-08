const DSL_LANGUAGE_ID = 'dsl';
const initialCode = 
`tag s = <style:simple>
tag c = <code:python>
var info = 'write code correctly'

// Проверка/ревью
review_Code {
    <code_check:detailed>
    <make_test:true>
    <code:continue>
}

make_Code {
    .s
    .c
    <prompt:load>
    <code:write>
    #review_Code
}

#main-module = make_Code + s
`;

function parse_tags_labels_vars(lines) {
    const tags = {}, tagloc = {},
          labels = {}, labelloc = {},
          vars = {}, varloc = {};
    const tagPat = /^\s*tag\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*<([A-Za-z_][A-Za-z0-9_]*:[A-Za-z0-9_.\-]+)>/;
    const labelPat = /^\s*([A-Za-z_][A-Za-z0-9_-]*)\s*\{/;
    const varPat = /^\s*var\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*('.*?')\s*$/;

    lines.forEach((line, i) => {
        let m = tagPat.exec(line);
        if (m) {
            let name = m[1];
            if (!(name in tags)) {
                tags[name] = m[2];
                tagloc[name] = { line: i, character: line.indexOf(name) };
            }
        }
        m = labelPat.exec(line);
        if (m) {
            let name = m[1];
            if (!(name in labels)) {
                labels[name] = true;
                labelloc[name] = { line: i, character: line.indexOf(name) };
            }
        }
        m = varPat.exec(line);
        if (m) {
            let name = m[1];
            if (!(name in vars)) {
                vars[name] = m[2];
                varloc[name] = { line: i, character: line.indexOf(name) };
            }
        }
    });
    return { tags, tagloc, labels, labelloc, vars, varloc };
}

function get_dsl_diagnostics(text) {
    const markers = [];
    const lines = text.split(/\r?\n/);
    const mainPat = /^\s*#main-module\s*=.*/;
    const mainLn = lines
        .map((l,i)=>mainPat.test(l)?i:null)
        .filter(x=>x!==null);
    if (mainLn.length === 0) {
        markers.push({
            severity: monaco.MarkerSeverity.Error,
            startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 2,
            message: "DSL должен содержать определение #main-module (главный блок входа)."
        });
    } else if(mainLn.length>1) {
        for (let n of mainLn.slice(1)) {
            markers.push({
                severity: monaco.MarkerSeverity.Error,
                startLineNumber: n+1, startColumn: 1, endLineNumber: n+1, endColumn: lines[n].length+1,
                message: "Разрешён только один #main-module."
            });
        }
    }
    const tagPatFull = /^\s*tag\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*<([A-Za-z_][A-Za-z0-9_]*:[A-Za-z0-9_.\-]+)>/;
    let tagSeen = new Set();
    lines.forEach((line,i)=>{
        let m=tagPatFull.exec(line);
        if(m){
            const name=m[1];
            if(tagSeen.has(name)) {
                markers.push({
                    severity: monaco.MarkerSeverity.Error,
                    startLineNumber: i+1, startColumn: line.indexOf(name)+1,
                    endLineNumber: i+1, endColumn: line.indexOf(name)+name.length+1,
                    message: `Тег '${name}' определён дважды.`
                });}
            tagSeen.add(name);
        }
        if (/^\s*tag\b/.test(line) && !tagPatFull.test(line)) {
            markers.push({
                severity: monaco.MarkerSeverity.Error,
                startLineNumber: i+1, startColumn: 1, endLineNumber: i+1, endColumn: line.length+1,
                message: "Синтаксис тэга: tag имя = <namespace:value> (напр. tag s = <code:py>)."
            });
        }
    });
    const labelPat = /^\s*([A-Za-z_][A-Za-z0-9_-]*)\s*\{/;
    let labelSeen = new Set();
    lines.forEach((line,i)=>{
        let m = labelPat.exec(line);
        if(m){
            const name = m[1];
            if(labelSeen.has(name)) {
                markers.push({
                    severity: monaco.MarkerSeverity.Error,
                    startLineNumber:i+1,startColumn:line.indexOf(name)+1,
                    endLineNumber:i+1,endColumn:line.indexOf(name)+name.length+1,
                    message:`Метка-блок '${name}' определена дважды.`
                });}
            labelSeen.add(name);
        }
    });
    const varPatFull = /^\s*var\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*('.*?')\s*$/;
    let varSeen = new Set();
    lines.forEach((line,i)=>{
        let m = varPatFull.exec(line);
        if(m){
            let name = m[1];
            if(varSeen.has(name)){
                markers.push({
                    severity: monaco.MarkerSeverity.Error,
                    startLineNumber:i+1, startColumn:line.indexOf(name)+1,
                    endLineNumber:i+1, endColumn:line.indexOf(name)+name.length+1,
                    message:`Переменная '${name}' определена дважды.`
                });
            }
            varSeen.add(name);
        }
        if (/^\s*var\b/.test(line) && !varPatFull.test(line)) {
            markers.push({
                severity: monaco.MarkerSeverity.Error,
                startLineNumber:i+1,startColumn:1,endLineNumber:i+1,endColumn:line.length+1,
                message:"Синтаксис переменной: var имя = 'строка'"
            });
        }
    });
   for(let i=0;i<lines.length;i++) {
        let line = lines[i];
        let open = (line.match(/</g)||[]).length;
        let close = (line.match(/>/g)||[]).length;
        if(open != close) {
            markers.push({
                severity: monaco.MarkerSeverity.Error,
                startLineNumber:i+1,startColumn:1,endLineNumber:i+1,endColumn:line.length+1,
                message:"Несовпадение количества < и > в строке"
            });
        }
        const tagPatAll = /<([^<>]*)>/g;
        let m;
        while (m = tagPatAll.exec(line)) {
            const chunk = m[1];
            if (!/^([A-Za-z_][A-Za-z0-9_]*):(.+)$/.test(chunk)) {
                markers.push({
                  severity: monaco.MarkerSeverity.Error,
                  startLineNumber:i+1,startColumn:m.index+1,
                  endLineNumber:i+1,endColumn:m.index+m[0].length+1,
                  message:'Внутри "< >" требуется двоеточие, строго: <namespace:value>'
                });
            }
        }
    }
    let stack = [];
    lines.forEach((line,i)=>{
        let open = (line.match(/{/g)||[]).length;
        let close = (line.match(/}/g)||[]).length;
        for(let k=0;k<open;k++) stack.push({line:i});
        for(let k=0;k<close;k++) {
            if(stack.length>0) stack.pop();
            else markers.push({
                severity: monaco.MarkerSeverity.Error,
                startLineNumber:i+1,startColumn:line.indexOf('}')+1||1,
                endLineNumber:i+1,endColumn:line.indexOf('}')+2||2,
                message:"Лишняя } закрывающая скобка."
            });
        }
    });
    if(stack.length>0){
        for(let s of stack){
            markers.push({
                severity: monaco.MarkerSeverity.Error,
                startLineNumber:s.line+1,startColumn:1,
                endLineNumber:s.line+1,endColumn:2,
                message:"Не закрыта { фигурная скобка для блока!"
            });
        }
    }
    return markers;
}


function provideCompletion(model, position) {
    const lines = model.getLinesContent();
    const line = lines[position.lineNumber-1];
    const {tags,labels,vars} = parse_tags_labels_vars(lines);

    if (/\.\w*$/.test(line.slice(0, position.column-1))) {
        return {
            suggestions: Object.keys(tags).map(tag=>({
                label: '.'+tag,
                kind: monaco.languages.CompletionItemKind.Reference,
                insertText: tag
            }))
        };
    }
    if (/#\w*$/.test(line.slice(0, position.column-1))) {
        return {
            suggestions: Object.keys(labels).map(lab=>({
                label: '#' + lab,
                kind: monaco.languages.CompletionItemKind.Reference,
                insertText: lab
            }))
        };
    }
    if (/var\s+\w*$/.test(line.slice(0, position.column-1))) {
        return {
            suggestions: Object.keys(vars).map(v=>({
                label: v,
                kind: monaco.languages.CompletionItemKind.Variable,
                insertText: v
            }))
        };
    }
    return { suggestions: [] };
}

function provideHover(model, position) {
    const lines = model.getLinesContent();
    const {tags,labels,vars} = parse_tags_labels_vars(lines);
    let word = model.getWordAtPosition(position);
    if(!word) return null;
    let label = word.word;

    if (/^\.\w+$/.test(label) && tags[label.slice(1)]) {
        return {
            contents: [
                {value: `**Тег:** \`${label.slice(1)} = <${tags[label.slice(1)]}>\``, isTrusted:true}
            ]
        };
    }
    if (/^\w+$/.test(label) && tags[label]) {
        return {
            contents: [
                {value: `**Тег:** \`${label} = <${tags[label]}>\``, isTrusted:true}
            ]
        };
    }
    if (/^#\w/.test(label) && labels[label.slice(1)]) {
        return {
            contents: [
                {value: `**Блок/метка:** \`${label.slice(1)}\``, isTrusted:true}
            ]
        }
    }
    if(vars[label]) {
        return {
            contents: [
                {value: `**Переменная:** \`${label}\` = ${vars[label]}`, isTrusted:true}
            ]
        }
    }
    return null;
}

// ctrl+click — jump to definition
function provideDefinition(model, position) {
    const lines = model.getLinesContent();
    const {tagloc, labelloc, varloc} = parse_tags_labels_vars(lines);
    let word = model.getWordAtPosition(position);
    if(!word) return null;
    let name = word.word;
    if(name[0]==='.') name = name.slice(1);
    if(name[0]==='#') name = name.slice(1);

    if(tagloc[name]) {
        let pos = tagloc[name];
        return [{
            range: new monaco.Range(pos.line+1,pos.character+1,pos.line+1,pos.character+1+name.length),
            uri: model.uri
        }];
    }
    if(labelloc[name]) {
        let pos = labelloc[name];
        return [{
            range: new monaco.Range(pos.line+1,pos.character+1,pos.line+1,pos.character+1+name.length),
            uri: model.uri
        }];
    }
    if(varloc[name]) {
        let pos = varloc[name];
        return [{
            range: new monaco.Range(pos.line+1,pos.character+1,pos.line+1,pos.character+1+name.length),
            uri: model.uri
        }];
    }
    return null;
}


require.config({ paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.44.0/min/vs' } });
require(['vs/editor/editor.main'], function() {
    monaco.languages.register({ id: DSL_LANGUAGE_ID });

    monaco.languages.setMonarchTokensProvider(DSL_LANGUAGE_ID, {
      tokenizer: {
        root: [
          [/#main-module\b/, 'keyword'],
          [/#\w+/, 'variable.preprocessor'],
          [/\btag\b/, 'type.identifier'],
          [/\bvar\b/, 'type.identifier'],
          [/\.[A-Za-z_]\w*/, 'tag'],
          [/<[^<>]*?>/, 'string.escape'],
          [/'[^']*'/, 'string'],
          [/\/\/.*$/, 'comment'],
          [/[A-Za-z_][A-Za-z0-9_-]*/, 'identifier'],
          [/[{}]/, 'delimiter.bracket'],
        ]
      }
    });

    monaco.editor.defineTheme('dslDarkF', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'keyword',      foreground: 'e7e99a', fontStyle:'bold'},
        { token: 'type.identifier', foreground: 'edd585'},
        { token: 'tag',           foreground: '83e4e4'},
        { token: 'string',        foreground: 'ecb9ff'},
        { token: 'string.escape', foreground: '7fc9e2'},
        { token: 'variable.preprocessor', foreground: 'e5c284', fontStyle:'bold'},
        { token: 'comment',       foreground: '676767', fontStyle: 'italic' },
        { token: 'identifier',    foreground: 'c2b97f'},
        { token: 'delimiter.bracket', foreground: 'eda73e', fontStyle:'bold'},
      ],
      colors: {
        'editor.background': "#191a20",
        'editor.lineHighlightBackground': "#23232380",
        'editorGutter.background': "#191a20"
      }
    });

    const editor = monaco.editor.create(document.getElementById('container'), {
      value: initialCode,
      language: DSL_LANGUAGE_ID,
      theme: 'dslDarkF',
      automaticLayout: true,
      minimap: {enabled:true},
      fontSize: 16,
      fontFamily: '"JetBrains Mono", "Fira Mono", monospace',
      roundedSelection: true,
      tabSize: 2,
      scrollbar: {vertical: "auto"},
    });

    function updateDiagnostics() {
        const text = editor.getValue();
        const markers = get_dsl_diagnostics(text);
        monaco.editor.setModelMarkers(editor.getModel(), DSL_LANGUAGE_ID, markers);
    }
    editor.onDidChangeModelContent(updateDiagnostics);
    updateDiagnostics();

    monaco.languages.registerCompletionItemProvider(DSL_LANGUAGE_ID, {
        triggerCharacters: ['.','#'],
        provideCompletionItems: provideCompletion
    });
    monaco.languages.registerHoverProvider(DSL_LANGUAGE_ID, {
        provideHover
    });
    monaco.languages.registerDefinitionProvider(DSL_LANGUAGE_ID, {
        provideDefinition
    });
});