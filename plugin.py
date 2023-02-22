from LSP.plugin.core.typing import Any, Tuple
from lsp_utils import NpmClientHandler
import os


def plugin_loaded() -> None:
    """
    Executed when Sublime Text loads the plugin.
    This doesn't automatically instantiate RosieLanguageServerPlugin. It is created when a file
    matching the file type selectors in rosie_language_server.sublime-settings matches first opened.
    """
    RosieLanguageServerPlugin.setup()


def plugin_unloaded() -> None:
    # Executed when Sublime Text unloads the plugin
    RosieLanguageServerPlugin.cleanup()


class RosieLanguageServerPlugin(NpmClientHandler):
    """
    NpmClientHandler: https://github.com/sublimelsp/lsp_utils/blob/master/st3/lsp_utils/npm_client_handler.py
    """
    package_name = __package__
    server_directory = 'language-server'
    # language-server\out\server.js
    server_binary_path = os.path.join(server_directory, 'out', 'server.js')
    # This is necessary when the compiled sources of the language server are not stored in the Sublime Text plugin's
    # repository, rather they are installed via a single package.json in the plugin repository.
    # If the compiled sources are stored in the plugin, as no 'npm install' is required
    # (e.g. https://github.com/sublimelsp/LSP-graphql), this assignment can be removed.
    skip_npm_install = True

    @classmethod
    def minimum_node_version(cls) -> Tuple[int, int, int]:
        # Method is coming from NpmClientHandler
        return (14, 0, 0)
