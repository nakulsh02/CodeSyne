(function initCodeSyneCatCompanion() {
    // Avoid double initialization
    if (window.__codesyneCatInitialized) return;
    window.__codesyneCatInitialized = true;

    const STORAGE_KEY = 'codesyne_hide_cat';
    let isHidden = localStorage.getItem(STORAGE_KEY) === 'true';

    let nekoEl = null;
    let dustbinEl = null;
    let contextMenuEl = null;
    let undoToastEl = null;

    let nekoPosX = 60;
    let nekoPosY = 90;
    let mousePosX = 60;
    let mousePosY = 90;
    let frameCount = 0;
    let idleTime = 0;
    let idleAnimation = null;
    let idleAnimationFrame = 0;
    const nekoSpeed = 12;

    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let catStartPosX = 0;
    let catStartPosY = 0;
    let isNearDustbin = false;
    let isSleepingForced = false;

    // High performance RAF loop control
    let rafId = null;
    let lastFrameTime = 0;
    const FRAME_INTERVAL = 85; // ~12fps for retro pixel art animation

    // Sprite offsets in cat.gif (32x32 tiles)
    const spriteSets = {
        idle: [[-3, -3]],
        alert: [[-7, -3]],
        scratch: [
            [-5, 0],
            [-6, 0],
            [-7, 0],
        ],
        tired: [[-3, -2]],
        sleeping: [
            [-2, 0],
            [-2, -1],
        ],
        N: [
            [-1, -2],
            [-1, -3],
        ],
        NE: [
            [0, -2],
            [0, -3],
        ],
        E: [
            [-3, 0],
            [-3, -1],
        ],
        SE: [
            [-5, -1],
            [-5, -2],
        ],
        S: [
            [-6, -3],
            [-7, -2],
        ],
        SW: [
            [-5, -3],
            [-6, -1],
        ],
        W: [
            [-4, -2],
            [-4, -3],
        ],
        NW: [
            [-1, 0],
            [-1, -1],
        ],
    };

    function injectStyles() {
        if (document.getElementById('codesyne-cat-styles')) return;
        const style = document.createElement('style');
        style.id = 'codesyne-cat-styles';
        style.textContent = `
            #oneko {
                width: 32px;
                height: 32px;
                position: fixed;
                pointer-events: auto;
                cursor: grab;
                z-index: 999999;
                background-image: url('/assets/cat.gif');
                image-rendering: pixelated;
                image-rendering: -moz-crisp-edges;
                image-rendering: crisp-edges;
                left: 0;
                top: 0;
                user-select: none;
                -webkit-user-select: none;
                touch-action: none;
                will-change: transform;
                transform: translate3d(60px, 90px, 0);
                transition: filter 0.2s ease, opacity 0.25s ease;
                filter: drop-shadow(0 4px 10px rgba(0, 0, 0, 0.55));
            }
            #oneko:hover {
                filter: drop-shadow(0 0 10px rgba(129, 140, 248, 0.75)) drop-shadow(0 4px 12px rgba(0, 0, 0, 0.7));
            }
            #oneko.dragging {
                cursor: grabbing;
                filter: drop-shadow(0 10px 20px rgba(0, 0, 0, 0.75)) drop-shadow(0 0 12px rgba(129, 140, 248, 0.6));
                transition: none !important;
            }
            #oneko.vanishing {
                transform: translate3d(var(--neko-x, 60px), var(--neko-y, 90px), 0) scale(0) !important;
                opacity: 0 !important;
                transition: transform 0.32s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.28s ease !important;
            }
            #oneko.spawning {
                animation: nekoSpawn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
            }
            @keyframes nekoSpawn {
                0% { opacity: 0; }
                70% { opacity: 1; }
                100% { opacity: 1; }
            }

            /* Minimalist Trash Drop Target (Icon Only) */
            #oneko-dustbin {
                position: fixed;
                bottom: 28px;
                left: 50%;
                transform: translateX(-50%) translateY(100px) scale(0.85);
                z-index: 1000000;
                width: 52px;
                height: 52px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                background: rgba(15, 17, 30, 0.94);
                border: 1.5px solid rgba(244, 63, 94, 0.45);
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.75), 0 0 18px rgba(244, 63, 94, 0.25);
                backdrop-filter: blur(14px);
                -webkit-backdrop-filter: blur(14px);
                color: #fda4af;
                pointer-events: none;
                opacity: 0;
                will-change: transform, opacity;
                transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease, color 0.2s ease;
                user-select: none;
            }
            #oneko-dustbin.visible {
                transform: translateX(-50%) translateY(0) scale(1);
                opacity: 1;
            }
            #oneko-dustbin.hovering {
                transform: translateX(-50%) translateY(-6px) scale(1.22);
                background: rgba(225, 29, 72, 0.4);
                border-color: #f43f5e;
                box-shadow: 0 14px 40px rgba(244, 63, 94, 0.65), 0 0 32px rgba(244, 63, 94, 0.85);
                color: #ffffff;
            }
            #oneko-dustbin svg {
                width: 22px;
                height: 22px;
                transition: transform 0.2s ease;
            }
            #oneko-dustbin.hovering svg {
                transform: scale(1.15);
                animation: trashWiggle 0.35s ease infinite alternate;
            }
            @keyframes trashWiggle {
                0% { transform: scale(1.15) rotate(-8deg); }
                100% { transform: scale(1.15) rotate(8deg); }
            }

            /* Mini Context Menu (Right Click) */
            #oneko-context-menu {
                position: fixed;
                z-index: 1000002;
                background: #0b0f24;
                border: 1px solid rgba(129, 140, 248, 0.3);
                border-radius: 12px;
                padding: 6px;
                box-shadow: 0 12px 32px rgba(0, 0, 0, 0.85), 0 0 18px rgba(99, 102, 241, 0.2);
                display: none;
                flex-direction: column;
                gap: 3px;
                min-width: 140px;
                backdrop-filter: blur(14px);
                user-select: none;
            }
            #oneko-context-menu button {
                background: transparent;
                border: none;
                color: #e2e8f0;
                padding: 7px 10px;
                border-radius: 8px;
                font-size: 11.5px;
                font-weight: 600;
                text-align: left;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 8px;
                transition: background 0.15s ease, color 0.15s ease;
            }
            #oneko-context-menu button:hover {
                background: rgba(99, 102, 241, 0.2);
                color: #ffffff;
            }
            #oneko-context-menu button.danger:hover {
                background: rgba(244, 63, 94, 0.25);
                color: #fb7185;
            }

            /* Undo Notification Toast with Multi-Directional Swipe to Dismiss */
            #oneko-undo-toast {
                position: fixed;
                bottom: 20px;
                left: 50%;
                transform: translateX(-50%) translateY(80px) scale(0.95);
                z-index: 1000003;
                background: rgba(10, 14, 28, 0.97);
                border: 1px solid rgba(129, 140, 248, 0.35);
                border-radius: 14px;
                padding: 10px 14px;
                display: flex;
                align-items: center;
                gap: 12px;
                color: #f8fafc;
                font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                font-size: 12.5px;
                font-weight: 500;
                box-shadow: 0 16px 40px rgba(0, 0, 0, 0.85), 0 0 24px rgba(99, 102, 241, 0.25);
                opacity: 0;
                pointer-events: none;
                cursor: grab;
                user-select: none;
                -webkit-user-select: none;
                touch-action: none;
                backdrop-filter: blur(20px);
                -webkit-backdrop-filter: blur(20px);
                will-change: transform, opacity;
                transition: transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s ease;
                max-width: calc(100vw - 32px);
            }
            @media (min-width: 640px) {
                #oneko-undo-toast {
                    bottom: 24px;
                    right: 24px;
                    left: auto;
                    transform: translateY(80px) scale(0.95);
                }
            }
            #oneko-undo-toast.visible {
                opacity: 1;
                pointer-events: auto;
                transform: translateX(-50%) translateY(0) scale(1);
            }
            @media (min-width: 640px) {
                #oneko-undo-toast.visible {
                    transform: translateY(0) scale(1);
                }
            }
            #oneko-undo-toast.swiping {
                cursor: grabbing;
                transition: none !important;
            }
            #oneko-undo-toast.dismissed {
                opacity: 0 !important;
                transition: transform 0.24s ease-out, opacity 0.2s ease-out !important;
            }
            #oneko-undo-toast .toast-indicator {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background: #818cf8;
                box-shadow: 0 0 10px #818cf8, 0 0 4px #818cf8;
                flex-shrink: 0;
            }
            #oneko-undo-toast span {
                white-space: nowrap;
                letter-spacing: 0.01em;
                font-size: 12.5px;
                color: #e2e8f0;
                font-weight: 600;
            }
            #oneko-undo-toast button.undo-btn {
                background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
                color: #ffffff;
                border: 1px solid rgba(255, 255, 255, 0.15);
                padding: 5px 12px;
                border-radius: 9px;
                font-size: 11.5px;
                font-weight: 700;
                cursor: pointer;
                transition: all 0.15s ease;
                white-space: nowrap;
                box-shadow: 0 3px 10px rgba(79, 70, 229, 0.45);
            }
            #oneko-undo-toast button.undo-btn:hover {
                background: linear-gradient(135deg, #818cf8 0%, #6366f1 100%);
                transform: translateY(-1px);
                box-shadow: 0 4px 14px rgba(99, 102, 241, 0.6);
            }
            #oneko-undo-toast button.undo-btn:active {
                transform: translateY(1px);
            }
            #oneko-undo-toast button.close-btn {
                background: rgba(255, 255, 255, 0.05);
                border: 1px solid rgba(255, 255, 255, 0.08);
                color: #94a3b8;
                cursor: pointer;
                padding: 0;
                width: 22px;
                height: 22px;
                font-size: 11px;
                border-radius: 7px;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.15s ease;
                flex-shrink: 0;
            }
            #oneko-undo-toast button.close-btn:hover {
                color: #ffffff;
                background: rgba(255, 255, 255, 0.15);
                border-color: rgba(255, 255, 255, 0.2);
            }
        `;
        document.head.appendChild(style);
    }

    function createDustbin() {
        if (dustbinEl) return;
        dustbinEl = document.createElement('div');
        dustbinEl.id = 'oneko-dustbin';
        dustbinEl.title = 'Drop cat here to dismiss';
        dustbinEl.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 6h18"/>
                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                <line x1="10" x2="10" y1="11" y2="17"/>
                <line x1="14" x2="14" y1="11" y2="17"/>
            </svg>
        `;
        document.body.appendChild(dustbinEl);
    }

    function createContextMenu() {
        if (contextMenuEl) return;
        contextMenuEl = document.createElement('div');
        contextMenuEl.id = 'oneko-context-menu';
        contextMenuEl.innerHTML = `
            <button id="neko-menu-sleep">Rest / Sleep</button>
            <button id="neko-menu-follow">Follow Cursor</button>
            <button id="neko-menu-hide" class="danger">Hide Cat</button>
        `;
        document.body.appendChild(contextMenuEl);

        document.getElementById('neko-menu-sleep')?.addEventListener('click', (e) => {
            e.stopPropagation();
            hideContextMenu();
            isSleepingForced = true;
            idleAnimation = 'sleeping';
            idleAnimationFrame = 10;
            setSprite('sleeping', 0);
        });

        document.getElementById('neko-menu-follow')?.addEventListener('click', (e) => {
            e.stopPropagation();
            hideContextMenu();
            isSleepingForced = false;
            resetIdleAnimation();
            idleTime = 0;
        });

        document.getElementById('neko-menu-hide')?.addEventListener('click', (e) => {
            e.stopPropagation();
            hideContextMenu();
            dismissCatWithAnimation();
        });

        document.addEventListener('click', (e) => {
            if (contextMenuEl && !contextMenuEl.contains(e.target)) {
                hideContextMenu();
            }
        });
    }

    function showContextMenu(x, y) {
        if (!contextMenuEl) createContextMenu();
        contextMenuEl.style.left = `${Math.min(x, window.innerWidth - 150)}px`;
        contextMenuEl.style.top = `${Math.min(y, window.innerHeight - 130)}px`;
        contextMenuEl.style.display = 'flex';
    }

    function hideContextMenu() {
        if (contextMenuEl) {
            contextMenuEl.style.display = 'none';
        }
    }

    function createUndoToast() {
        if (undoToastEl) return;
        undoToastEl = document.createElement('div');
        undoToastEl.id = 'oneko-undo-toast';
        undoToastEl.innerHTML = `
            <div class="toast-indicator"></div>
            <span>Companion dismissed</span>
            <button id="neko-undo-btn" class="undo-btn">Undo</button>
            <button id="neko-undo-close" class="close-btn" title="Dismiss">✕</button>
        `;
        document.body.appendChild(undoToastEl);

        document.getElementById('neko-undo-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            showCat();
            hideUndoToast();
        });

        document.getElementById('neko-undo-close')?.addEventListener('click', (e) => {
            e.stopPropagation();
            hideUndoToast();
        });

        // Multi-directional swipe to dismiss (Left, Right, Up, Down for Touch and Mouse)
        let isSwipingToast = false;
        let startX = 0;
        let startY = 0;
        let currentX = 0;
        let currentY = 0;
        let startTime = 0;

        function onToastStart(e) {
            if (e.target && (e.target.id === 'neko-undo-btn' || e.target.id === 'neko-undo-close')) {
                return;
            }
            const isTouch = e.type === 'touchstart';
            const clientX = isTouch ? e.touches[0].clientX : e.clientX;
            const clientY = isTouch ? e.touches[0].clientY : e.clientY;

            isSwipingToast = true;
            startX = clientX;
            startY = clientY;
            currentX = clientX;
            currentY = clientY;
            startTime = Date.now();

            undoToastEl?.classList.add('swiping');
            clearTimeout(undoToastTimer);

            if (isTouch) {
                document.addEventListener('touchmove', onToastMove, { passive: false });
                document.addEventListener('touchend', onToastEnd);
            } else {
                document.addEventListener('mousemove', onToastMove);
                document.addEventListener('mouseup', onToastEnd);
            }
        }

        function onToastMove(e) {
            if (!isSwipingToast || !undoToastEl) return;
            const isTouch = e.type === 'touchmove';
            const clientX = isTouch ? e.touches[0].clientX : e.clientX;
            const clientY = isTouch ? e.touches[0].clientY : e.clientY;

            currentX = clientX;
            currentY = clientY;

            const deltaX = currentX - startX;
            const deltaY = currentY - startY;
            const dist = Math.hypot(deltaX, deltaY);

            // Responsive transform calculation
            const isDesktop = window.innerWidth >= 640;
            const baseTransform = isDesktop ? '' : 'translateX(-50%) ';
            const opacity = Math.max(0.2, 1 - dist / 140);

            undoToastEl.style.transform = `${baseTransform}translate3d(${deltaX}px, ${deltaY}px, 0)`;
            undoToastEl.style.opacity = `${opacity}`;

            if (isTouch && dist > 8 && e.cancelable) {
                e.preventDefault();
            }
        }

        function onToastEnd() {
            if (!isSwipingToast || !undoToastEl) return;
            isSwipingToast = false;

            document.removeEventListener('touchmove', onToastMove);
            document.removeEventListener('touchend', onToastEnd);
            document.removeEventListener('mousemove', onToastMove);
            document.removeEventListener('mouseup', onToastEnd);

            undoToastEl.classList.remove('swiping');

            const deltaX = currentX - startX;
            const deltaY = currentY - startY;
            const dist = Math.hypot(deltaX, deltaY);
            const duration = Math.max(1, Date.now() - startTime);
            const speed = dist / duration; // px per ms

            // Swipe dismissal threshold: > 35px or flick speed > 0.45 px/ms in ANY direction
            if (dist > 35 || speed > 0.45) {
                undoToastEl.classList.add('dismissed');
                const isDesktop = window.innerWidth >= 640;
                const baseTransform = isDesktop ? '' : 'translateX(-50%) ';
                const flyX = deltaX * 2.5;
                const flyY = deltaY * 2.5;
                undoToastEl.style.transform = `${baseTransform}translate3d(${flyX}px, ${flyY}px, 0)`;
                undoToastEl.style.opacity = '0';
                setTimeout(() => {
                    hideUndoToast();
                    if (undoToastEl) {
                        undoToastEl.classList.remove('dismissed');
                        undoToastEl.style.transform = '';
                        undoToastEl.style.opacity = '';
                    }
                }, 240);
            } else {
                // Snap back to origin
                undoToastEl.style.transform = '';
                undoToastEl.style.opacity = '';
                // Resume auto-hide timer
                undoToastTimer = setTimeout(() => {
                    hideUndoToast();
                }, 4000);
            }
        }

        undoToastEl.addEventListener('touchstart', onToastStart, { passive: true });
        undoToastEl.addEventListener('mousedown', onToastStart);
    }

    let undoToastTimer = null;
    function showUndoToast() {
        if (!undoToastEl) createUndoToast();
        undoToastEl.style.transform = '';
        undoToastEl.style.opacity = '';
        undoToastEl.classList.remove('dismissed', 'swiping');
        undoToastEl.classList.add('visible');
        clearTimeout(undoToastTimer);
        undoToastTimer = setTimeout(() => {
            hideUndoToast();
        }, 5000);
    }

    function hideUndoToast() {
        if (undoToastEl) {
            undoToastEl.classList.remove('visible');
            undoToastEl.style.transform = '';
            undoToastEl.style.opacity = '';
        }
    }

    function dismissCatWithAnimation() {
        if (!nekoEl) return;
        nekoEl.style.setProperty('--neko-x', `${nekoPosX - 16}px`);
        nekoEl.style.setProperty('--neko-y', `${nekoPosY - 16}px`);
        nekoEl.classList.add('vanishing');
        setTimeout(() => {
            hideCat();
            nekoEl?.classList.remove('vanishing');
            showUndoToast();
        }, 320);
    }

    // Update cat target position with boundary constraints and wake up
    function updateTargetPosition(x, y, wakeUp = true) {
        mousePosX = Math.min(Math.max(20, x), window.innerWidth - 20);
        mousePosY = Math.min(Math.max(48, y), window.innerHeight - 24);
        if (wakeUp && isSleepingForced) {
            isSleepingForced = false;
            resetIdleAnimation();
            idleTime = 0;
        }
    }

    function createCat() {
        injectStyles();
        createDustbin();
        createContextMenu();
        createUndoToast();

        if (!nekoEl) {
            nekoEl = document.createElement('div');
            nekoEl.id = 'oneko';
            nekoEl.title = 'Screen Cat Companion (Drag anywhere, or drop on trash icon to dismiss)';
            document.body.appendChild(nekoEl);

            // Drag event listeners (Mouse & Touch)
            nekoEl.addEventListener('mousedown', onDragStart);
            nekoEl.addEventListener('touchstart', onDragStart, { passive: false });

            // Context menu on right click
            nekoEl.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                showContextMenu(e.clientX, e.clientY);
            });
        }

        if (isHidden) {
            nekoEl.style.display = 'none';
        } else {
            nekoEl.style.display = 'block';
            nekoEl.classList.add('spawning');
            setTimeout(() => nekoEl?.classList.remove('spawning'), 450);
        }

        renderPosition();

        // High Sensitivity Global Event Listeners in Capture Phase (Phone touch, editor typing, mouse)
        const handleGlobalTouch = (event) => {
            if (isDragging) return;
            if (event.touches && event.touches.length > 0) {
                updateTargetPosition(event.touches[0].clientX, event.touches[0].clientY, true);
            }
        };

        const handleGlobalMouse = (event) => {
            if (isDragging) return;
            updateTargetPosition(event.clientX, event.clientY, false);
        };

        // Pointer, touch, and mouse tracking with capture: true ensures events in Monaco editor, terminals, and overlays are captured
        window.addEventListener('touchstart', handleGlobalTouch, { capture: true, passive: true });
        window.addEventListener('touchmove', handleGlobalTouch, { capture: true, passive: true });
        window.addEventListener('pointerdown', (e) => {
            if (!isDragging && e.clientX && e.clientY) {
                updateTargetPosition(e.clientX, e.clientY, true);
            }
        }, { capture: true, passive: true });
        window.addEventListener('mousemove', handleGlobalMouse, { capture: true, passive: true });

        // Custom editor cursor / typing event from Monaco
        window.addEventListener('codesyne-cat-target', (e) => {
            if (isDragging) return;
            if (e.detail && typeof e.detail.x === 'number' && typeof e.detail.y === 'number') {
                updateTargetPosition(e.detail.x, e.detail.y, true);
            }
        });

        // Keydown/typing tracking - waking up the cat when user types in editor or inputs
        window.addEventListener('keydown', () => {
            if (isDragging) return;
            if (isSleepingForced) {
                isSleepingForced = false;
                resetIdleAnimation();
                idleTime = 0;
            }
        }, { capture: true, passive: true });

        // Pause/Resume loop on tab visibility changes to completely prevent hanging/memory leaks
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                stopLoop();
            } else {
                startLoop();
            }
        });

        startLoop();
    }

    // Drag handlers
    function onDragStart(e) {
        if (e.button === 2) return; // Right click handled by contextmenu
        e.preventDefault();
        e.stopPropagation();

        isDragging = true;
        isSleepingForced = false;
        resetIdleAnimation();

        const isTouch = e.type === 'touchstart';
        const clientX = isTouch ? e.touches[0].clientX : e.clientX;
        const clientY = isTouch ? e.touches[0].clientY : e.clientY;

        dragStartX = clientX;
        dragStartY = clientY;
        catStartPosX = nekoPosX;
        catStartPosY = nekoPosY;

        nekoEl?.classList.add('dragging');
        
        // Put cat in cute sitting / alert pose while dragging
        setSprite('idle', 0);

        // Reveal dustbin target
        dustbinEl?.classList.add('visible');

        // Add document-level mouse and touch listeners for reliable drag on computer & mobile
        document.addEventListener('mousemove', onDragMove, { passive: false });
        document.addEventListener('touchmove', onDragMove, { passive: false });
        document.addEventListener('mouseup', onDragEnd);
        document.addEventListener('touchend', onDragEnd);
        window.addEventListener('blur', onDragEnd);
    }

    function onDragMove(e) {
        if (!isDragging || !nekoEl) return;
        if (e.cancelable) {
            e.preventDefault();
        }

        const isTouch = e.type === 'touchmove';
        const clientX = isTouch ? e.touches[0].clientX : e.clientX;
        const clientY = isTouch ? e.touches[0].clientY : e.clientY;

        const deltaX = clientX - dragStartX;
        const deltaY = clientY - dragStartY;

        nekoPosX = Math.min(Math.max(16, catStartPosX + deltaX), window.innerWidth - 16);
        nekoPosY = Math.min(Math.max(16, catStartPosY + deltaY), window.innerHeight - 16);

        renderPosition();

        // Check distance to dustbin circle
        if (dustbinEl) {
            const rect = dustbinEl.getBoundingClientRect();
            const dustbinCenterX = rect.left + rect.width / 2;
            const dustbinCenterY = rect.top + rect.height / 2;

            const dist = Math.hypot(nekoPosX - dustbinCenterX, nekoPosY - dustbinCenterY);

            if (dist < 75) {
                isNearDustbin = true;
                dustbinEl.classList.add('hovering');
            } else {
                isNearDustbin = false;
                dustbinEl.classList.remove('hovering');
            }
        }
    }

    function onDragEnd() {
        if (!isDragging) return;
        isDragging = false;

        document.removeEventListener('mousemove', onDragMove);
        document.removeEventListener('touchmove', onDragMove);
        document.removeEventListener('mouseup', onDragEnd);
        document.removeEventListener('touchend', onDragEnd);
        window.removeEventListener('blur', onDragEnd);

        nekoEl?.classList.remove('dragging');

        // Hide dustbin target
        dustbinEl?.classList.remove('visible', 'hovering');

        if (isNearDustbin) {
            isNearDustbin = false;
            dismissCatWithAnimation();
        } else {
            // Cat placed in new position
            mousePosX = nekoPosX;
            mousePosY = nekoPosY;
            setSprite('idle', 0);
        }
    }

    function setSprite(name, frameIdx) {
        if (!nekoEl) return;
        const sprite = spriteSets[name][frameIdx % spriteSets[name].length];
        nekoEl.style.backgroundPosition = `${sprite[0] * 32}px ${sprite[1] * 32}px`;
    }

    function renderPosition() {
        if (!nekoEl) return;
        nekoEl.style.transform = `translate3d(${nekoPosX - 16}px, ${nekoPosY - 16}px, 0)`;
    }

    function resetIdleAnimation() {
        idleAnimation = null;
        idleAnimationFrame = 0;
    }

    function idle() {
        if (isSleepingForced) {
            setSprite('sleeping', Math.floor(idleAnimationFrame / 4));
            idleAnimationFrame += 1;
            return;
        }

        idleTime += 1;

        if (
            idleTime > 10 &&
            Math.floor(Math.random() * 200) === 0 &&
            idleAnimation === null
        ) {
            idleAnimation = ['sleeping', 'scratch'][Math.floor(Math.random() * 2)];
        }

        switch (idleAnimation) {
            case 'sleeping':
                if (idleAnimationFrame < 8) {
                    setSprite('tired', 0);
                    break;
                }
                setSprite('sleeping', Math.floor(idleAnimationFrame / 4));
                if (idleAnimationFrame > 192) {
                    resetIdleAnimation();
                }
                break;
            case 'scratch':
                setSprite('scratch', idleAnimationFrame);
                if (idleAnimationFrame > 9) {
                    resetIdleAnimation();
                }
                break;
            default:
                setSprite('idle', 0);
                return;
        }
        idleAnimationFrame += 1;
    }

    function step() {
        if (isHidden || isDragging || !nekoEl) return;

        frameCount += 1;
        const diffX = nekoPosX - mousePosX;
        const diffY = nekoPosY - mousePosY;
        const distance = Math.hypot(diffX, diffY);

        if (distance < nekoSpeed || distance < 42) {
            idle();
            return;
        }

        idleAnimation = null;
        idleAnimationFrame = 0;
        isSleepingForced = false;

        if (idleTime > 1) {
            setSprite('alert', 0);
            idleTime = Math.min(idleTime, 7);
            idleTime -= 1;
            return;
        }

        let direction = diffY / distance > 0.5 ? 'N' : '';
        direction += diffY / distance < -0.5 ? 'S' : '';
        direction += diffX / distance > 0.5 ? 'W' : '';
        direction += diffX / distance < -0.5 ? 'E' : '';
        setSprite(direction, frameCount);

        nekoPosX -= (diffX / distance) * nekoSpeed;
        nekoPosY -= (diffY / distance) * nekoSpeed;

        nekoPosX = Math.min(Math.max(16, nekoPosX), window.innerWidth - 16);
        nekoPosY = Math.min(Math.max(48, nekoPosY), window.innerHeight - 24);

        renderPosition();
    }

    // High performance RequestAnimationFrame loop with timestamp delta
    function animationLoop(timestamp) {
        if (!lastFrameTime) lastFrameTime = timestamp;
        const delta = timestamp - lastFrameTime;

        if (delta >= FRAME_INTERVAL) {
            step();
            lastFrameTime = timestamp - (delta % FRAME_INTERVAL);
        }

        if (!document.hidden && !isHidden) {
            rafId = requestAnimationFrame(animationLoop);
        } else {
            rafId = null;
        }
    }

    function startLoop() {
        if (!rafId && !document.hidden && !isHidden) {
            lastFrameTime = 0;
            rafId = requestAnimationFrame(animationLoop);
        }
    }

    function stopLoop() {
        if (rafId) {
            cancelAnimationFrame(rafId);
            rafId = null;
        }
    }

    // Public API
    function hideCat() {
        isHidden = true;
        localStorage.setItem(STORAGE_KEY, 'true');
        stopLoop();
        if (nekoEl) nekoEl.style.display = 'none';
        window.dispatchEvent(new CustomEvent('codesyne-cat-visibility-changed', { detail: { hidden: true } }));
    }

    function showCat() {
        isHidden = false;
        localStorage.setItem(STORAGE_KEY, 'false');
        if (!nekoEl) {
            createCat();
        } else {
            nekoEl.style.display = 'block';
            nekoEl.classList.add('spawning');
            setTimeout(() => nekoEl?.classList.remove('spawning'), 450);
            startLoop();
        }
        window.dispatchEvent(new CustomEvent('codesyne-cat-visibility-changed', { detail: { hidden: false } }));
    }

    function toggleCat(forceVal) {
        if (typeof forceVal === 'boolean') {
            if (forceVal) showCat();
            else hideCat();
        } else {
            if (isHidden) showCat();
            else hideCat();
        }
        return !isHidden;
    }

    // Expose to window
    window.toggleCatCompanion = toggleCat;
    window.showCatCompanion = showCat;
    window.hideCatCompanion = hideCat;
    window.isCatCompanionHidden = () => isHidden;

    window.addEventListener('codesyne-toggle-cat', (e) => {
        const detail = e.detail;
        if (detail && typeof detail.hidden === 'boolean') {
            toggleCat(!detail.hidden);
        } else {
            toggleCat();
        }
    });

    // Boot
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createCat);
    } else {
        createCat();
    }
})();
