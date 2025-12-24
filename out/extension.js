"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
const vscode = require("vscode");
function activate(context) {
    // 实例化 Provider
    const provider = new TetrisViewProvider(context.extensionUri);
    // 注册侧边栏视图
    context.subscriptions.push(vscode.window.registerWebviewViewProvider('tetris.sidebarView', provider));
    // 允许通过命令重置游戏（可选）
    context.subscriptions.push(vscode.commands.registerCommand('tetris.reset', () => {
        provider.resetGame();
    }));
}
class TetrisViewProvider {
    constructor(_extensionUri) {
        this._extensionUri = _extensionUri;
    }
    // 侧边栏 Webview 初始化回调
    resolveWebviewView(webviewView, context, _token) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };
        // --- 核心修改：当 Webview 状态改变（如失去焦点或被遮挡）时主动触发暂停 ---
        webviewView.onDidChangeVisibility(() => {
            if (!webviewView.visible) {
                webviewView.webview.postMessage({ command: 'pause' });
            }
        });
        // ------------------------------------------------------------------
        // 获取当前用户设置的下落速度
        const config = vscode.workspace.getConfiguration('tetris');
        const dropSpeed = config.get('dropSpeed') || 1000;
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview, dropSpeed);
    }
    resetGame() {
        if (this._view) {
            this._view.webview.postMessage({ command: 'reset' });
        }
    }
    _getHtmlForWebview(webview, dropSpeed) {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { 
                        background-color: var(--vscode-editor-background); 
                        color: var(--vscode-editor-foreground); 
                        display: flex; 
                        flex-direction: column; 
                        align-items: center; 
                        padding-top: 20px;
                        height: 100vh; 
                        margin: 0; 
                        overflow: hidden; 
                        font-family: var(--vscode-font-family);
                    }
                    /* 侧边栏空间有限，自动缩放 Canvas */
                    canvas { 
                        border: 2px solid var(--vscode-panel-border); 
                        max-width: 90%;
                        height: auto;
                    }
                    .info { margin-bottom: 10px; text-align: center; font-size: 0.9em; }
                    #pause-overlay {
                        display: none;
                        position: absolute;
                        background: rgba(0,0,0,0.6);
                        padding: 10px;
                        border-radius: 5px;
                        font-weight: bold;
                        color: #fff;
                        z-index: 10;
                    }
                </style>
            </head>
            <body>
                <div id="pause-overlay">PAUSED</div>
                <div class="info">
                    <div>Score: <span id="score">0</span></div>
                </div>
                <div style="font-size: 12px; color: var(--vscode-descriptionForeground);">
                    Arrows: Move/Rotate | Space: Pause
                </div>
                <canvas id="tetris" width="240" height="400"></canvas>
                <script>
                    const canvas = document.getElementById('tetris');
                    const context = canvas.getContext('2d');
                    const pauseOverlay = document.getElementById('pause-overlay');
                    const vscodeStyle = getComputedStyle(document.body);
                    const bgColor = vscodeStyle.getPropertyValue('--vscode-editor-background');

                    context.scale(20, 20);
                    let paused = false;
                    let score = 0;
                    // 使用从插件设置中获取的速度
                    let dropInterval = ${dropSpeed};

                    function createMatrix(w, h) {
                        const matrix = [];
                        while (h--) matrix.push(new Array(w).fill(0));
                        return matrix;
                    }

                    const colors = [null, '#FF0D72', '#0DC2FF', '#0DFF72', '#F538FF', '#FF8E0D', '#FFE138', '#3877FF'];

                    function collide(arena, player) {
                        const [m, o] = [player.matrix, player.pos];
                        for (let y = 0; y < m.length; ++y) {
                            for (let x = 0; x < m[y].length; ++x) {
                                if (m[y][x] !== 0 && (arena[y + o.y] && arena[y + o.y][x + o.x]) !== 0) {
                                    return true;
                                }
                            }
                        }
                        return false;
                    }

                    function merge(arena, player) {
                        player.matrix.forEach((row, y) => {
                            row.forEach((value, x) => {
                                if (value !== 0) {
                                    arena[y + player.pos.y][x + player.pos.x] = value;
                                }
                            });
                        });
                    }

                    function arenaSweep() {
                        let rowCount = 1;
                        outer: for (let y = arena.length - 1; y > 0; --y) {
                            for (let x = 0; x < arena[y].length; ++x) {
                                if (arena[y][x] === 0) continue outer;
                            }
                            const row = arena.splice(y, 1)[0].fill(0);
                            arena.unshift(row);
                            ++y;
                            score += rowCount * 10;
                            rowCount *= 2;
                        }
                        document.getElementById('score').innerText = score;
                    }

                    function rotate(matrix, dir) {
                        for (let y = 0; y < matrix.length; ++y) {
                            for (let x = 0; x < y; ++x) {
                                [matrix[x][y], matrix[y][x]] = [matrix[y][x], matrix[x][y]];
                            }
                        }
                        if (dir > 0) matrix.forEach(row => row.reverse());
                        else matrix.reverse();
                    }

                    function createPiece(type) {
                        if (type === 'T') return [[0, 1, 0], [1, 1, 1], [0, 0, 0]];
                        if (type === 'O') return [[2, 2], [2, 2]];
                        if (type === 'L') return [[0, 3, 0], [0, 3, 0], [0, 3, 3]];
                        if (type === 'J') return [[0, 4, 0], [0, 4, 0], [4, 4, 0]];
                        if (type === 'I') return [[0, 5, 0, 0], [0, 5, 0, 0], [0, 5, 0, 0], [0, 5, 0, 0]];
                        if (type === 'S') return [[0, 6, 6], [6, 6, 0], [0, 0, 0]];
                        if (type === 'Z') return [[7, 7, 0], [0, 7, 7], [0, 0, 0]];
                    }

                    let arena = createMatrix(12, 20);
                    const player = { pos: {x: 0, y: 0}, matrix: null };

                    function playerDrop() {
                        if (paused) return;
                        player.pos.y++;
                        if (collide(arena, player)) {
                            player.pos.y--;
                            merge(arena, player);
                            playerReset();
                            arenaSweep();
                        }
                        dropCounter = 0;
                    }

                    function playerMove(dir) {
                        if (paused) return;
                        player.pos.x += dir;
                        if (collide(arena, player)) player.pos.x -= dir;
                    }

                    function playerRotate(dir) {
                        if (paused) return;
                        const pos = player.pos.x;
                        let offset = 1;
                        rotate(player.matrix, dir);
                        while (collide(arena, player)) {
                            player.pos.x += offset;
                            offset = -(offset + (offset > 0 ? 1 : -1));
                            if (offset > player.matrix[0].length) {
                                rotate(player.matrix, -dir);
                                player.pos.x = pos;
                                return;
                            }
                        }
                    }

                    function playerReset() {
                        const pieces = 'ILJOTSZ';
                        player.matrix = createPiece(pieces[pieces.length * Math.random() | 0]);
                        player.pos.y = 0;
                        player.pos.x = (arena[0].length / 2 | 0) - (player.matrix[0].length / 2 | 0);
                        if (collide(arena, player)) {
                            arena.forEach(row => row.fill(0));
                            score = 0;
                            document.getElementById('score').innerText = score;
                        }
                    }

                    function drawMatrix(matrix, offset) {
                        matrix.forEach((row, y) => {
                            row.forEach((value, x) => {
                                if (value !== 0) {
                                    context.fillStyle = colors[value];
                                    context.fillRect(x + offset.x, y + offset.y, 1, 1);
                                }
                            });
                        });
                    }

                    function draw() {
                        context.fillStyle = bgColor;
                        context.fillRect(0, 0, canvas.width, canvas.height);
                        drawMatrix(arena, {x: 0, y: 0});
                        drawMatrix(player.matrix, player.pos);
                    }

                    // 统一处理暂停状态的方法
                    function setPaused(state) {
                        paused = state;
                        pauseOverlay.style.display = paused ? 'block' : 'none';
                    }

                    let dropCounter = 0;
                    let lastTime = 0;
                    function update(time = 0) {
                        const deltaTime = time - lastTime;
                        lastTime = time;
                        if (!paused) {
                            dropCounter += deltaTime;
                            if (dropCounter > dropInterval) playerDrop();
                        }
                        draw();
                        requestAnimationFrame(update);
                    }

                    window.addEventListener('keydown', event => {
                        if (event.keyCode === 32) { // Space 键切换暂停
                            setPaused(!paused);
                            event.preventDefault();
                        } else if (event.keyCode === 37) playerMove(-1);
                        else if (event.keyCode === 39) playerMove(1);
                        else if (event.keyCode === 40) playerDrop();
                        else if (event.keyCode === 38) playerRotate(1);
                    });

                    // 核心修改：使用 focusout 和 blur 双重监听焦点移出
                    window.addEventListener('blur', () => setPaused(true));
                    window.addEventListener('focusout', () => setPaused(true));

                    // 接收来自插件主体的消息
                    window.addEventListener('message', event => {
                        const message = event.data;
                        if (message.command === 'reset') {
                            arena.forEach(row => row.fill(0));
                            playerReset();
                            score = 0;
                            document.getElementById('score').innerText = score;
                            setPaused(false);
                        } else if (message.command === 'pause') {
                            setPaused(true);
                        }
                    });

                    playerReset();
                    update();
                </script>
            </body>
            </html>
        `;
    }
}
//# sourceMappingURL=extension.js.map