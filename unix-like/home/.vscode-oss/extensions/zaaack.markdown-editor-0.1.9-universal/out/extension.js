"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = void 0;
const vscode = __importStar(require("vscode"));
const NodePath = __importStar(require("path"));
const KeyVditorOptions = 'vditor.options';
function debug(...args) {
    console.log(...args);
}
function activate(context) {
    context.subscriptions.push(vscode.commands.registerCommand('markdown-editor.openEditor', (uri, ...args) => {
        debug('command', uri, args);
        EditorPanel.createOrShow(context, uri);
    }));
    context.globalState.setKeysForSync([KeyVditorOptions]);
}
exports.activate = activate;
function getWebviewOptions(extensionUri) {
    return {
        // Enable javascript in the webview
        enableScripts: true,
        retainContextWhenHidden: true,
    };
}
/**
 * Manages cat coding webview panels
 */
class EditorPanel {
    constructor(_context, _panel, _extensionUri, _document, // 当前有 markdown 编辑器
    _uri = _document.uri // 从资源管理器打开，只有 uri 没有 _document
    ) {
        // Set the webview's initial html content
        var _a;
        this._context = _context;
        this._panel = _panel;
        this._extensionUri = _extensionUri;
        this._document = _document;
        this._uri = _uri;
        this._disposables = [];
        this._isEdit = false;
        this._init();
        // Listen for when the panel is disposed
        // This happens when the user closes the panel or when the panel is closed programmatically
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        let textEditTimer;
        // close EditorPanel when vsc editor is close
        vscode.workspace.onDidCloseTextDocument((e) => {
            if (e.fileName === this._fsPath) {
                this.dispose();
            }
        }, this._disposables);
        // update EditorPanel when vsc editor changes
        vscode.workspace.onDidChangeTextDocument((e) => {
            if (e.document.fileName !== this._document.fileName) {
                return;
            }
            // 当 webview panel 激活时不将由 webview编辑导致的 vsc 编辑器更新同步回 webview
            // don't change webview panel when webview panel is focus
            if (this._panel.active) {
                return;
            }
            textEditTimer && clearTimeout(textEditTimer);
            textEditTimer = setTimeout(() => {
                this._update();
                this._updateEditTitle();
            }, 300);
        }, this._disposables);
        // Handle messages from the webview
        const imageSaveFolder = (this._config.get('imageSaveFolder') || 'assets').replace('${projectRoot}', ((_a = vscode.workspace.getWorkspaceFolder(this._uri)) === null || _a === void 0 ? void 0 : _a.uri.fsPath) || '');
        this._panel.webview.onDidReceiveMessage(async (message) => {
            debug('msg from webview review', message, this._panel.active);
            const syncToEditor = async () => {
                debug('sync to editor', this._document, this._uri);
                if (this._document) {
                    const edit = new vscode.WorkspaceEdit();
                    edit.replace(this._document.uri, new vscode.Range(0, 0, this._document.lineCount, 0), message.content);
                    await vscode.workspace.applyEdit(edit);
                }
                else if (this._uri) {
                    await vscode.workspace.fs.writeFile(this._uri, message.content);
                }
                else {
                    vscode.window.showErrorMessage(`Cannot find original file to save!`);
                }
            };
            switch (message.command) {
                case 'ready':
                    this._update({
                        type: 'init',
                        options: {
                            useVscodeThemeColor: this._config.get('useVscodeThemeColor'),
                            ...this._context.globalState.get(KeyVditorOptions),
                        },
                        theme: vscode.window.activeColorTheme.kind ===
                            vscode.ColorThemeKind.Dark
                            ? 'dark'
                            : 'light',
                    });
                    break;
                case 'save-options':
                    this._context.globalState.update(KeyVditorOptions, message.options);
                    break;
                case 'info':
                    vscode.window.showInformationMessage(message.content);
                    break;
                case 'error':
                    vscode.window.showErrorMessage(message.content);
                    break;
                case 'edit': {
                    // 只有当 webview 处于编辑状态时才同步到 vsc 编辑器，避免重复刷新
                    if (this._panel.active) {
                        await syncToEditor();
                        this._updateEditTitle();
                    }
                    break;
                }
                case 'reset-config': {
                    await this._context.globalState.update(KeyVditorOptions, {});
                    break;
                }
                case 'save': {
                    await syncToEditor();
                    await this._document.save();
                    this._updateEditTitle();
                    break;
                }
                case 'upload': {
                    const assetsFolder = NodePath.resolve(NodePath.dirname(this._fsPath), imageSaveFolder);
                    await Promise.all(message.files.map(async (f) => {
                        const content = Buffer.from(f.base64, 'base64');
                        return vscode.workspace.fs.writeFile(vscode.Uri.file(NodePath.join(assetsFolder, f.name)), content);
                    }));
                    const files = message.files.map((f) => NodePath.relative(NodePath.dirname(this._fsPath), NodePath.join(assetsFolder, f.name)));
                    this._panel.webview.postMessage({
                        command: 'uploaded',
                        files,
                    });
                    break;
                }
                case 'open-link': {
                    let url = message.href;
                    if (!/^http/.test(url)) {
                        url = NodePath.resolve(this._fsPath, '..', url);
                    }
                    vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(url));
                    break;
                }
            }
        }, null, this._disposables);
    }
    static async createOrShow(context, uri) {
        var _a, _b;
        const { extensionUri } = context;
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;
        if (EditorPanel.currentPanel && uri !== ((_a = EditorPanel.currentPanel) === null || _a === void 0 ? void 0 : _a._uri)) {
            EditorPanel.currentPanel.dispose();
        }
        // If we already have a panel, show it.
        if (EditorPanel.currentPanel) {
            EditorPanel.currentPanel._panel.reveal(column);
            return;
        }
        if (!vscode.window.activeTextEditor && !uri) {
            vscode.window.showErrorMessage(`Did not open markdown file!`);
            return;
        }
        let doc;
        // from context menu : 从当前打开的 textEditor 中寻找 是否有当前 markdown 的 editor, 有的话则绑定 document
        if (uri) {
            // 从右键打开文件，先打开文档然后开启自动同步，不然没法保存文件和同步到已经打开的document
            doc = await vscode.workspace.openTextDocument(uri);
        }
        else {
            doc = (_b = vscode.window.activeTextEditor) === null || _b === void 0 ? void 0 : _b.document;
            // from command mode
            if (doc && doc.languageId !== 'markdown') {
                vscode.window.showErrorMessage(`Current file language is not markdown, got ${doc.languageId}`);
                return;
            }
        }
        if (!doc) {
            vscode.window.showErrorMessage(`Cannot find markdown file!`);
            return;
        }
        // Otherwise, create a new panel.
        const panel = vscode.window.createWebviewPanel(EditorPanel.viewType, 'markdown-editor', column || vscode.ViewColumn.One, getWebviewOptions(extensionUri));
        EditorPanel.currentPanel = new EditorPanel(context, panel, extensionUri, doc, uri);
    }
    get _fsPath() {
        return this._uri.fsPath;
    }
    get _config() {
        return vscode.workspace.getConfiguration('markdown-editor');
    }
    dispose() {
        EditorPanel.currentPanel = undefined;
        // Clean up our resources
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }
    _init() {
        const webview = this._panel.webview;
        this._panel.webview.html = this._getHtmlForWebview(webview);
        this._panel.title = NodePath.basename(this._fsPath);
    }
    _updateEditTitle() {
        const isEdit = this._document.isDirty;
        if (isEdit !== this._isEdit) {
            this._isEdit = isEdit;
            this._panel.title = `${isEdit ? `[edit]` : ''}${NodePath.basename(this._fsPath)}`;
        }
    }
    // private fileToWebviewUri = (f: string) => {
    //   return this._panel.webview.asWebviewUri(vscode.Uri.file(f)).toString()
    // }
    async _update(props = { options: void 0 }) {
        const md = this._document
            ? this._document.getText()
            : (await vscode.workspace.fs.readFile(this._uri)).toString();
        // const dir = NodePath.dirname(this._document.fileName)
        this._panel.webview.postMessage({
            command: 'update',
            content: md,
            ...props,
        });
    }
    _getHtmlForWebview(webview) {
        const toUri = (f) => webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, f));
        const baseHref = NodePath.dirname(webview.asWebviewUri(vscode.Uri.file(this._fsPath)).toString()) + '/';
        const toMediaPath = (f) => `media/dist/${f}`;
        const JsFiles = ['main.js'].map(toMediaPath).map(toUri);
        const CssFiles = ['main.css'].map(toMediaPath).map(toUri);
        return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">

				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<base href="${baseHref}" />


				${CssFiles.map((f) => `<link href="${f}" rel="stylesheet">`).join('\n')}

				<title>markdown editor</title>
			</head>
			<body>
				<div id="app"></div>


				${JsFiles.map((f) => `<script src="${f}"></script>`).join('\n')}
			</body>
			</html>`;
    }
}
EditorPanel.viewType = 'markdown-editor';
//# sourceMappingURL=extension.js.map