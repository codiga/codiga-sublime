"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.connection = void 0;
const node_1 = require("vscode-languageserver/node");
const vscode_languageserver_textdocument_1 = require("vscode-languageserver-textdocument");
const rosieCache_1 = require("./rosie/rosieCache");
const client_1 = require("./graphql-api/client");
const diagnostics_1 = require("./diagnostics/diagnostics");
const activity_1 = require("./utils/activity");
const configurationCache_1 = require("./utils/configurationCache");
const rosiefix_1 = require("./rosie/rosiefix");
const vscode_languageserver_types_1 = require("vscode-languageserver-types");
const add_rule_fix_record_1 = require("./graphql-api/add-rule-fix-record");
const vscode_languageserver_1 = require("vscode-languageserver");
const ignore_violation_1 = require("./diagnostics/ignore-violation");
const connectionMocks_1 = require("./test/connectionMocks");
const connectionLogger_1 = require("./utils/connectionLogger");
/**
 * Retrieves the 'fingerprint' command line argument, so that later we can determine whether the
 * fingerprint has to be generated on server side, or there is already one generated in the client application.
 */
const fingerprintArgs = process.argv.filter(arg => arg.match('fingerprint=.*'));
/**
 * Creates a connection for the server. The connection uses Node's IPC as a transport mechanism.
 * Includes all preview / proposed LSP features.
 *
 * In case of unit test execution it creates a MockConnection, so that we don't need to have (and deal with)
 * and actual language server connection.
 */
exports.connection = !global.isInTestMode
    ? (0, node_1.createConnection)(node_1.ProposedFeatures.all)
    : (0, connectionMocks_1.createMockConnection)();
(0, connectionLogger_1.initConsole)(exports.connection.console);
//Creates a simple text document manager
const documents = new node_1.TextDocuments(vscode_languageserver_textdocument_1.TextDocument);
let hasConfigurationCapability;
let hasWorkspaceCapability;
let hasWorkspaceFoldersCapability;
let hasDiagnosticCapability;
let hasApplyEditCapability;
let hasCodeActionLiteralSupport;
let hasCodeActionResolveSupport;
let hasCodeActionDataSupport;
let clientName;
let clientVersion;
/**
 * Starts to initialize the language server.
 *
 * In case of VS Code, upon opening a different folder in the same window, the server is shut down,
 * and a new language client is initialized.
 */
exports.connection.onInitialize((_params) => {
    //https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#workspace_didChangeConfiguration
    hasConfigurationCapability = !!(_params.capabilities.workspace
        && _params.capabilities.workspace.configuration
        && _params.capabilities.workspace?.didChangeConfiguration);
    hasWorkspaceCapability = !!(_params.capabilities.workspace);
    //https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#workspace_workspaceFolders
    //While text editors like VS Code, Sublime Text and such support multiple workspaces, for example Jupyter Lab doesn't,
    // so in those cases we rely on 'rootUri' as the single workspace root.
    hasWorkspaceFoldersCapability = !!(_params.capabilities.workspace?.workspaceFolders);
    if (!hasWorkspaceFoldersCapability) {
        (0, configurationCache_1.cacheWorkspaceFolders)(_params.rootUri ? [_params.rootUri] : []);
    }
    //https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_publishDiagnostics
    hasDiagnosticCapability = !!(_params.capabilities.textDocument &&
        _params.capabilities.textDocument.publishDiagnostics);
    //https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#workspace_executeCommand
    //https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#workspace_applyEdit
    hasApplyEditCapability = !!(hasWorkspaceCapability && _params.capabilities.workspace?.applyEdit);
    /**
     * Clients need to announce their support for code action literals (e.g. literals of type CodeAction) and
     * code action kinds via the corresponding client capability codeAction.codeActionLiteralSupport.
     *
     * https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_codeAction
     */
    hasCodeActionLiteralSupport = !!(_params.capabilities.textDocument?.codeAction?.codeActionLiteralSupport);
    hasCodeActionResolveSupport = !!(_params.capabilities.textDocument?.codeAction?.resolveSupport);
    hasCodeActionDataSupport = !!(_params.capabilities.textDocument?.codeAction?.dataSupport);
    //If there is no support for diagnostics, which is the core functionality and purpose of the Rosie platform,
    // return with no capability, and don't register any further event handler.
    if (!hasDiagnosticCapability)
        return { capabilities: {} };
    //Retrieves client information, so that we can use it in the User-Agent header of GraphQL requests
    clientName = _params.clientInfo?.name;
    clientVersion = _params.clientInfo?.version;
    /**
     * Runs when the configuration, e.g. the Codiga API Token changes.
     */
    exports.connection.onDidChangeConfiguration(async (_change) => {
        (0, configurationCache_1.cacheCodigaApiToken)(_change.settings?.codiga?.api?.token);
        documents.all().forEach(validateTextDocument);
    });
    // Coda Actions / Quick Fixes
    /**
     * Returns CodeActions for the requested document range.
     *
     * This is executed not just when displaying the list of quick fixes for a diagnostic,
     * but also when diagnostics are computed.
     */
    exports.connection.onCodeAction(params => {
        const codeActions = [];
        if (hasApplyEditCapability && hasCodeActionLiteralSupport && params.context.diagnostics.length > 0) {
            const document = documents.get(params.textDocument.uri);
            if (document) {
                codeActions.push(...(0, rosiefix_1.provideApplyFixCodeActions)(document, params.range));
                const ignoreFixes = (0, ignore_violation_1.provideIgnoreFixCodeActions)(document, params.range, params);
                codeActions.push(...ignoreFixes);
            }
        }
        return codeActions;
    });
    /**
     * Invoked when the user actually uses/invokes a code action.
     *
     * It computes the 'edit' property of the CodeAction in this handler, so that it is evaluated
     * only when we actually need that information, kind of lazy evaluation.
     */
    exports.connection.onCodeActionResolve(codeAction => {
        if (codeAction.data) {
            if (codeAction.data.fixKind === "rosie.rule.fix") {
                const document = documents.get(codeAction.data.documentUri);
                if (document) {
                    const rosieFixEdits = codeAction.data.rosieFixEdits;
                    (0, rosiefix_1.createAndSetRuleFixCodeActionEdit)(codeAction, document, rosieFixEdits);
                }
            }
            else if (codeAction.data.fixKind === "rosie.ignore.violation.fix") {
                const document = documents.get(codeAction.data.documentUri);
                if (document && codeAction.diagnostics) {
                    //codeAction.diagnostics[0] is alright because there is only one Diagnostic saved per ignore-violation CodeAction.
                    codeAction.edit = (0, ignore_violation_1.createIgnoreWorkspaceEdit)(document, codeAction.diagnostics[0]?.range);
                }
            }
        }
        return codeAction;
    });
    /**
     * Runs when a command, e.g. a command associated to a CodeAction, is executed.
     *
     * Commands are registered in the 'executeCommandProvider.commands' property of the InitializeResult object below.
     *
     * The "codiga.applyFix" id is associated to the CodeAction in rosieFix.ts#createRuleFix.
     */
    exports.connection.onExecuteCommand(params => {
        if (params.command === 'codiga.applyFix') {
            (0, add_rule_fix_record_1.addRuleFixRecord)();
        }
    });
    // Document changes and diagnostics
    /**
     * Runs when a document gets opened.
     */
    documents.onDidOpen(change => {
        (0, activity_1.recordLastActivity)();
        validateTextDocument(change.document);
    });
    /**
     * Runs when a document gets closed.
     */
    documents.onDidClose(change => {
    });
    /**
     * Runs when the text document first opened or when its content has changed.
     *
     * Save doesn't have to be invoked on the document in order for this event handler to execute.
     */
    documents.onDidChangeContent(change => {
        (0, activity_1.recordLastActivity)();
        validateTextDocument(change.document);
    });
    const initResult = {
        capabilities: {
            textDocumentSync: node_1.TextDocumentSyncKind.Incremental
        }
    };
    if (hasCodeActionLiteralSupport) {
        if (hasApplyEditCapability) {
            initResult.capabilities.executeCommandProvider = {
                commands: ['codiga.applyFix']
            };
        }
        initResult.capabilities.codeActionProvider = {
            codeActionKinds: [vscode_languageserver_types_1.CodeActionKind.QuickFix]
        };
        if (hasCodeActionResolveSupport && hasCodeActionDataSupport) {
            initResult.capabilities.codeActionProvider.resolveProvider = true;
        }
    }
    return initResult;
});
/**
 * Runs when the language server finished initialization.
 */
exports.connection.onInitialized(async () => {
    //Based on https://code.visualstudio.com/api/language-extensions/language-server-extension-guide
    if (!global.isInTestMode && hasConfigurationCapability) {
        await exports.connection.client.register(vscode_languageserver_1.DidChangeConfigurationNotification.type, undefined);
    }
    if (hasWorkspaceFoldersCapability) {
        //Initial caching when initialized
        const folders = (await exports.connection.workspace.getWorkspaceFolders())?.map(folder => folder.uri) ?? [];
        (0, configurationCache_1.cacheWorkspaceFolders)(folders);
        //Whenever the set of workspace folders changes, we cache the new set
        exports.connection.workspace.onDidChangeWorkspaceFolders(async (e) => {
            const folders = (await exports.connection.workspace.getWorkspaceFolders())?.map(folder => folder.uri) ?? [];
            (0, configurationCache_1.cacheWorkspaceFolders)(folders);
        });
    }
    //If there is only one 'fingerprint' command line argument, get its value,
    // otherwise we return undefined, so that the server will generate its value.
    const userFingerprint = fingerprintArgs && fingerprintArgs.length === 1
        ? fingerprintArgs[0].replace('fingerprint=', '')
        : undefined;
    (0, configurationCache_1.cacheUserFingerprint)(userFingerprint);
    //Initializes the GraphQL client
    (0, client_1.initializeClient)(clientName, clientVersion);
    /*
      In Jupyter Lab, the configuration is not available via 'connection.workspace.getConfiguration("codiga.api.token")' for some reason,
      but only via the DidChangeConfigurationParams in 'connection.onDidChangeConfiguration()'.
      Also, Jupyter Lab triggers a call for `onDidChangeConfiguration()` when 'getConfiguration()' is first called here.
      This trigger doesn't seem to happen with VS Code and Sublime Text.
  
      There are two such calls, one with an empty configuration ({}), the second one with the actual contents of the configuration.
  
      Thus, in order to have the codiga.api.token cached, we
        - first, call 'getConfiguration()', and save its result,
        - if `onDidChangeConfiguration()` cached the value in the meantime, we don't update the cache (e.g. Jupyter Lab)
        - if `onDidChangeConfiguration()` didn't cache the value, we use the returned value (e.g. VS Code)
     */
    const apiToken = await exports.connection.workspace.getConfiguration("codiga.api.token");
    if (!(0, configurationCache_1.getApiToken)()) {
        (0, configurationCache_1.cacheCodigaApiToken)(apiToken);
    }
    //Start the rules cache updater only if the client supports diagnostics
    if (hasDiagnosticCapability) {
        (0, rosieCache_1.setAllTextDocumentsValidator)(() => documents.all().forEach(validateTextDocument));
        (0, rosieCache_1.refreshCachePeriodic)();
    }
});
/**
 * Sends the text document to Rosie for analysis, constructs the Diagnostic objects
 * based on the returned analysis results, and sends them to the client application to display them in the editor.
 *
 * @param textDocument the text document being analyzed
 */
async function validateTextDocument(textDocument) {
    try {
        (0, diagnostics_1.refreshDiagnostics)(textDocument, diags => exports.connection.sendDiagnostics({ uri: textDocument.uri, diagnostics: diags }));
    }
    catch (e) {
        exports.connection.console.error(`Error while validating ${textDocument.uri}`);
        exports.connection.console.error(String(e));
    }
}
// Make the text document manager listen on the connection for open, change and close text document events.
if (!global.isInTestMode) {
    documents.listen(exports.connection);
    exports.connection.listen();
}
//# sourceMappingURL=server.js.map