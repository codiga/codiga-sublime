# Development Guide

This document provides insights into how the plugin works.

## Plugin structure

```
Rosie Language Server
    - language-server
        - node_modules                          <-- The dependencies required for the server to operate.
        - out                                   <-- The compiled sources of the server.
        - package.json                          <-- The package.json from the 'server' folder of the Codiga vscode-plugin.
        - install-language-server.sh            <-- A shell script to update the server sources in the repository.
    - dependencies.json                         <-- Defines the dependent libraries this plugin uses.
    - Main.sublime-menu                         <-- Registers a menu item for plugin configuration under 'Preferences > Package Settings > LSP > Servers'
    - plugin.py                                 <-- The entry point for the plugin.
    - rosie_language_server.sublime-commands    <-- Registers a command on the Command Palette to open the plugin settings. 
    - rosie_language_server.sublime-settings    <-- The plugin settings that also appear for the users as default settings.
    - sublime-package.json                      
```

## Language server launch

Sublime Text launches the language server when a file with a Rosie-supported type is opened.

Workspace change on server side is triggered when a folder is added to the current Sublime project.

## File type selectors in settings

File type selectors, on which the plugin/language server is initialized, are defined in `rosie_language_server.sublime-settings`.

Sublime Selectors documentation: https://www.sublimetext.com/docs/selectors.html

Selector values are defined based on
- https://github.com/sublimelsp/LSP-eslint/blob/master/LSP-eslint.sublime-settings
- https://github.com/sublimelsp/LSP-pyright/blob/master/LSP-pyright.sublime-settings

## Use the latest version of the language server

If there is a change in the Rosie Language Server, its compiled sources must be updated in this plugin as well. To clone the server repository,
install dependencies, and compile sources, you can simply execute `install-language-server.sh` in the `language-server` folder.

## Develop with local version of the Rosie Language Server

When you have the vscode-plugin sources available in your local environment, you can use the compiled version of them for local development
of the Sublime Text plugin.

Based on Windows example paths:
- first, compile the language server sources
- copy the server's compiled `out` and `node_modules` folders into `c:\Users\<username>\AppData\Roaming\Sublime Text\Packages\Rosie Language Server\language-server\`
- if not empty, delete the contents of `c:\Users\<username>\AppData\Local\Sublime Text\Package Storage\Rosie Language Server\<nodejs version>\`.
- launch/restart Sublime Text

When launching/restarting Sublime Text, it installs the plugin, during which it automatically copies the sources from the first folder to this one, and invokes NPM install,
and such, if configured so in the plugin.

## Troubleshooting

Here are some resources for investigating issues with language server launch and behaviour:
- Sublime Text LSP: [Troubleshooting](https://lsp.sublimetext.io/troubleshooting/)
