# Prompt System DSL

Prompt System DSL is a specialized domain-specific language (DSL) for configuring and building prompts for LLMs. The project includes a [visual editor][1], syntax highlighting, tag and block autocompletion, and conversion of DSL code into different prompt formats (RAW/MID/MINI). There is also a TUI interface implemented in Python for offline conversion.

## Installation and Launch

1. Clone the repository.
2. Install the required packages:
```bash
pip install -r requirements.txt
```
3. To run the web editor locally:
   ```
   python run_webui.py
   ```
   The browser will open automatically after launch.
4. For the offline TUI:
   ```
   python dsl_tui.py
   ```

## Syntax Example
```
tag st = <style:compact>

greeting {
   <text:greeting>
   .st
}

#main-module = greeting
```

## Features

- Quickly describe prompts using blocks, tags, and variables.
- Three levels of prompt text optimization: RAW, MID, MINI.
- Syntax highlighting, validation, and autocomplete support.
- Both graphical and text user interfaces available.
