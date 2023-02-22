# Sublime Text Plugin for the Rosie Language Server

Sublime Text plugin for integrating with Codiga's Rosie Language Server available at [Codiga/vscode-plugin](https://github.com/codiga/vscode-plugin/server).

## Prerequisites and installation

- Install [**LSP**](https://packagecontrol.io/packages/LSP) and **Rosie Language Server** from Package Control.
- Restart Sublime Text.

The server requires v14 or later version of the Node runtime.

## Configuration

Open the configuration file via the command palette with the **Preferences: Rosie Language Server**  command,
or via `Preferences > Package Settings > LSP > Servers > Rosie Language Server`. It contains the following configuration:

**codiga.api.token**

If you have a Codiga Hub account registered, you can specify your Codiga API Token here, so you have access to your private
rulesets.
