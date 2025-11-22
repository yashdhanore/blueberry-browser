import { WebContents } from "electron";

export interface AgentOverlayUpdate {
  type:
    | "start"
    | "turn"
    | "reasoning"
    | "action"
    | "actionComplete"
    | "screenshot"
    | "complete"
    | "error";
  data: any;
}

export class AgentOverlay {
  private webContents: WebContents;
  private isInjected: boolean = false;

  constructor(webContents: WebContents) {
    this.webContents = webContents;
  }

  /**
   * Inject the overlay UI into the tab
   */
  async inject(): Promise<void> {
    if (this.isInjected) return;

    const overlayHTML = this.getOverlayHTML();
    const overlayCSS = this.getOverlayCSS();
    const overlayJS = this.getOverlayJS();

    await this.webContents.executeJavaScript(`
      (function() {
        // Remove existing overlay if any
        const existing = document.getElementById('blueberry-agent-overlay-root');
        if (existing) existing.remove();

        // Inject CSS
        const style = document.createElement('style');
        style.id = 'blueberry-agent-overlay-styles';
        style.textContent = ${JSON.stringify(overlayCSS)};
        document.head.appendChild(style);

        // Inject HTML
        const container = document.createElement('div');
        container.id = 'blueberry-agent-overlay-root';
        container.innerHTML = ${JSON.stringify(overlayHTML)};
        document.body.appendChild(container);

        // Inject JS
        ${overlayJS}

        // Initialize
        window.__blueberryAgentOverlay.init();
      })();
    `);

    this.isInjected = true;
  }

  /**
   * Update the overlay with new data
   */
  async update(update: AgentOverlayUpdate): Promise<void> {
    if (!this.isInjected) return;

    await this.webContents.executeJavaScript(`
      if (window.__blueberryAgentOverlay) {
        window.__blueberryAgentOverlay.update(${JSON.stringify(update)});
      }
    `);
  }

  /**
   * Remove the overlay from the tab
   */
  async remove(): Promise<void> {
    if (!this.isInjected) return;

    await this.webContents.executeJavaScript(`
      (function() {
        const root = document.getElementById('blueberry-agent-overlay-root');
        if (root) root.remove();

        const styles = document.getElementById('blueberry-agent-overlay-styles');
        if (styles) styles.remove();

        const blocker = document.getElementById('blueberry-agent-click-blocker');
        if (blocker) blocker.remove();

        delete window.__blueberryAgentOverlay;
      })();
    `);

    this.isInjected = false;
  }

  /**
   * HTML structure for the overlay
   */
  private getOverlayHTML(): string {
    return `
      <!-- Click Blocking Overlay -->
      <div id="blueberry-agent-click-blocker" class="bb-click-blocker"></div>

      <!-- Movable Popup -->
      <div id="blueberry-agent-popup" class="bb-popup">
        <div class="bb-popup-header">
          <div class="bb-popup-title">
            <span class="bb-popup-icon">🤖</span>
            <span>Blueberry Agent</span>
          </div>
          <div class="bb-popup-controls">
            <button class="bb-popup-btn" id="bb-toggle-screenshot" title="Toggle Screenshot">📸</button>
            <button class="bb-popup-btn" id="bb-minimize" title="Minimize">−</button>
            <button class="bb-popup-btn" id="bb-close" title="Stop Agent">×</button>
          </div>
        </div>

        <div class="bb-popup-body">
          <div class="bb-section">
            <div class="bb-section-title">Status</div>
            <div class="bb-status">
              <span class="bb-status-dot"></span>
              <span id="bb-status-text">Starting...</span>
            </div>
          </div>

          <div class="bb-section">
            <div class="bb-section-title">Turn <span id="bb-turn-number">1</span></div>
          </div>

          <div class="bb-section" id="bb-reasoning-section">
            <div class="bb-section-title">💭 Thinking</div>
            <div class="bb-reasoning" id="bb-reasoning">Analyzing page...</div>
          </div>

          <div class="bb-section" id="bb-action-section" style="display: none;">
            <div class="bb-section-title">⚡ Action</div>
            <div class="bb-action" id="bb-action">-</div>
          </div>

          <div class="bb-section" id="bb-screenshot-section" style="display: none;">
            <div class="bb-section-title">👁️ Agent View</div>
            <img id="bb-screenshot" class="bb-screenshot" alt="What the agent sees" />
          </div>

          <div class="bb-section">
            <div class="bb-section-title">📋 Actions</div>
            <div class="bb-actions-list" id="bb-actions-list">
              <div class="bb-action-item">Waiting for first action...</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * CSS styles for the overlay
   */
  private getOverlayCSS(): string {
    return `
      /* Click Blocker */
      .bb-click-blocker {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(0, 0, 0, 0.02);
        z-index: 999998;
        cursor: not-allowed;
        backdrop-filter: blur(0.5px);
      }

      /* Popup Container */
      .bb-popup {
        position: fixed;
        top: 20px;
        right: 20px;
        width: 400px;
        max-height: 80vh;
        background: rgba(255, 255, 255, 0.98);
        border: 2px solid #3b82f6;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(59, 130, 246, 0.1);
        z-index: 999999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
        overflow: hidden;
        animation: bb-popup-glow 2s ease-in-out infinite;
      }

      @keyframes bb-popup-glow {
        0%, 100% { box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2), 0 0 20px rgba(59, 130, 246, 0.3); }
        50% { box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2), 0 0 30px rgba(59, 130, 246, 0.6); }
      }

      .bb-popup.minimized {
        height: auto;
      }

      .bb-popup.minimized .bb-popup-body {
        display: none;
      }

      /* Header */
      .bb-popup-header {
        background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
        color: white;
        padding: 12px 16px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        cursor: move;
        user-select: none;
      }

      .bb-popup-title {
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: 600;
        font-size: 14px;
      }

      .bb-popup-icon {
        font-size: 18px;
      }

      .bb-popup-controls {
        display: flex;
        gap: 6px;
      }

      .bb-popup-btn {
        background: rgba(255, 255, 255, 0.2);
        border: none;
        color: white;
        width: 28px;
        height: 28px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.2s;
      }

      .bb-popup-btn:hover {
        background: rgba(255, 255, 255, 0.3);
      }

      /* Body */
      .bb-popup-body {
        padding: 16px;
        max-height: calc(80vh - 60px);
        overflow-y: auto;
        scrollbar-width: thin;
      }

      .bb-popup-body::-webkit-scrollbar {
        width: 6px;
      }

      .bb-popup-body::-webkit-scrollbar-track {
        background: #f1f5f9;
      }

      .bb-popup-body::-webkit-scrollbar-thumb {
        background: #cbd5e1;
        border-radius: 3px;
      }

      /* Section */
      .bb-section {
        margin-bottom: 16px;
      }

      .bb-section-title {
        font-size: 11px;
        font-weight: 600;
        color: #64748b;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 8px;
      }

      /* Status */
      .bb-status {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        background: #f0fdf4;
        border: 1px solid #86efac;
        border-radius: 6px;
        font-size: 13px;
        color: #166534;
      }

      .bb-status-dot {
        width: 8px;
        height: 8px;
        background: #22c55e;
        border-radius: 50%;
        animation: bb-pulse 2s ease-in-out infinite;
      }

      @keyframes bb-pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }

      /* Reasoning */
      .bb-reasoning {
        padding: 12px;
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 6px;
        font-size: 13px;
        line-height: 1.6;
        color: #334155;
        white-space: pre-wrap;
      }

      /* Action */
      .bb-action {
        padding: 10px 12px;
        background: #fef3c7;
        border: 1px solid #fbbf24;
        border-radius: 6px;
        font-size: 12px;
        font-family: 'Monaco', 'Menlo', monospace;
        color: #92400e;
      }

      /* Screenshot */
      .bb-screenshot {
        width: 100%;
        border: 1px solid #e2e8f0;
        border-radius: 6px;
        display: block;
      }

      /* Actions List */
      .bb-actions-list {
        max-height: 200px;
        overflow-y: auto;
        scrollbar-width: thin;
      }

      .bb-action-item {
        padding: 8px 12px;
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 6px;
        font-size: 12px;
        margin-bottom: 6px;
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .bb-action-item.success {
        background: #f0fdf4;
        border-color: #86efac;
      }

      .bb-action-item.failed {
        background: #fef2f2;
        border-color: #fca5a5;
      }

      .bb-action-item.pending {
        background: #fefce8;
        border-color: #fde047;
      }

      .bb-action-status {
        font-size: 16px;
      }
    `;
  }

  /**
   * JavaScript code for the overlay
   */
  private getOverlayJS(): string {
    return `
      window.__blueberryAgentOverlay = {
        state: {
          turn: 1,
          reasoning: '',
          currentAction: null,
          actions: [],
          screenshot: null,
          screenshotVisible: false,
        },

        init() {
          this.setupDragging();
          this.setupControls();
        },

        setupDragging() {
          const popup = document.getElementById('blueberry-agent-popup');
          const header = popup.querySelector('.bb-popup-header');
          let isDragging = false;
          let currentX;
          let currentY;
          let initialX;
          let initialY;

          header.addEventListener('mousedown', (e) => {
            if (e.target.closest('.bb-popup-btn')) return;
            isDragging = true;
            initialX = e.clientX - popup.offsetLeft;
            initialY = e.clientY - popup.offsetTop;
          });

          document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            e.preventDefault();
            currentX = e.clientX - initialX;
            currentY = e.clientY - initialY;
            popup.style.left = currentX + 'px';
            popup.style.top = currentY + 'px';
            popup.style.right = 'auto';
          });

          document.addEventListener('mouseup', () => {
            isDragging = false;
          });
        },

        setupControls() {
          document.getElementById('bb-minimize').addEventListener('click', () => {
            document.getElementById('blueberry-agent-popup').classList.toggle('minimized');
          });

          document.getElementById('bb-close').addEventListener('click', () => {
            // Send message to stop agent
            console.log('[Agent Overlay] User requested stop');
          });

          document.getElementById('bb-toggle-screenshot').addEventListener('click', () => {
            this.state.screenshotVisible = !this.state.screenshotVisible;
            const section = document.getElementById('bb-screenshot-section');
            section.style.display = this.state.screenshotVisible ? 'block' : 'none';
          });
        },

        update(event) {
          const { type, data } = event;

          switch (type) {
            case 'start':
              document.getElementById('bb-status-text').textContent = 'Running';
              break;

            case 'turn':
              this.state.turn = data.turn;
              document.getElementById('bb-turn-number').textContent = data.turn;
              break;

            case 'reasoning':
              this.state.reasoning = data.reasoning;
              document.getElementById('bb-reasoning').textContent = data.reasoning;
              break;

            case 'action':
              this.state.currentAction = data;
              document.getElementById('bb-action-section').style.display = 'block';
              document.getElementById('bb-action').textContent =
                data.name + '(' + JSON.stringify(data.args).slice(0, 100) + ')';

              // Add to actions list
              this.addActionToList(data.name, 'pending');
              break;

            case 'actionComplete':
              this.updateLastAction(data.success ? 'success' : 'failed');
              break;

            case 'screenshot':
              if (data.screenshot) {
                this.state.screenshot = data.screenshot;
                document.getElementById('bb-screenshot').src =
                  'data:image/png;base64,' + data.screenshot;
              }
              break;

            case 'complete':
              document.getElementById('bb-status-text').textContent = 'Completed ✓';
              document.querySelector('.bb-status').style.background = '#f0fdf4';
              document.querySelector('.bb-status').style.borderColor = '#86efac';
              document.querySelector('.bb-status-dot').style.background = '#22c55e';
              break;

            case 'error':
              document.getElementById('bb-status-text').textContent = 'Error: ' + data.error;
              document.querySelector('.bb-status').style.background = '#fef2f2';
              document.querySelector('.bb-status').style.borderColor = '#fca5a5';
              document.querySelector('.bb-status-dot').style.background = '#ef4444';
              break;
          }
        },

        addActionToList(name, status) {
          const list = document.getElementById('bb-actions-list');

          // Remove placeholder
          if (list.children[0]?.textContent.includes('Waiting')) {
            list.innerHTML = '';
          }

          const icons = {
            pending: '⏳',
            success: '✓',
            failed: '✗',
          };

          const item = document.createElement('div');
          item.className = 'bb-action-item ' + status;
          item.innerHTML =
            '<span class="bb-action-status">' + icons[status] + '</span>' +
            '<span>' + name + '</span>';

          list.appendChild(item);
          list.scrollTop = list.scrollHeight;
        },

        updateLastAction(status) {
          const list = document.getElementById('bb-actions-list');
          const lastItem = list.lastElementChild;
          if (lastItem) {
            lastItem.className = 'bb-action-item ' + status;
            const icon = status === 'success' ? '✓' : '✗';
            lastItem.querySelector('.bb-action-status').textContent = icon;
          }
        },
      };
    `;
  }
}
