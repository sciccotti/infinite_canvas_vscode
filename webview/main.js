// VS Code Infinite Canvas - Main Entry Point
// Simplified version that integrates with VS Code extension

import { InfiniteCanvas } from './src/InfiniteCanvasSimple.js';

class VSCodeCanvasApp {
    constructor() {
        this.canvas = null;
        this.isInitialized = false;
        this.pendingContent = null;
        
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }

    init() {
        console.log('🎨 Initializing VS Code Canvas App');
        
        // Check if canvas element exists
        const canvasElement = document.getElementById('canvas');
        console.log('📍 Canvas element found:', canvasElement);
        
        if (!canvasElement) {
            console.error('❌ Canvas element not found! Check HTML');
            return;
        }
        
        try {
            // Initialize the canvas
            this.canvas = new InfiniteCanvas('canvas');
            this.isInitialized = true;
            
            console.log('🎯 Canvas object created:', this.canvas);
            
            // Set up VS Code integration
            this.setupVSCodeIntegration();
            
            // Load any pending content
            if (this.pendingContent) {
                this.loadCanvasContent(this.pendingContent);
                this.pendingContent = null;
            }
            
            console.log('✅ Canvas app initialized successfully');
            
            // Test interaction
            console.log('📝 Canvas ready for interaction - try double-clicking!');
            
        } catch (error) {
            console.error('❌ Error initializing canvas:', error);
        }
    }

    setupVSCodeIntegration() {
        // Auto-save functionality with interaction awareness
        if (this.canvas && this.canvas.canvasState) {
            this.isUserInteracting = false;
            this.saveQueue = null;
            
            // Track user interactions to prevent save loops
            const inputHandler = this.canvas.inputHandler;
            if (inputHandler) {
                // Override mouse handlers to track interaction state
                const originalMouseDown = inputHandler.handleMouseDown.bind(inputHandler);
                const originalMouseUp = inputHandler.handleMouseUp.bind(inputHandler);
                
                inputHandler.handleMouseDown = (e) => {
                    this.isUserInteracting = true;
                    return originalMouseDown(e);
                };
                
                inputHandler.handleMouseUp = (e) => {
                    const result = originalMouseUp(e);
                    // Delay setting interaction to false to allow for completion
                    setTimeout(() => {
                        this.isUserInteracting = false;
                        // Save any queued changes
                        if (this.saveQueue) {
                            this.saveToVSCode();
                            this.saveQueue = null;
                        }
                    }, 100);
                    return result;
                };
            }
            
            // Save canvas state when it changes (but only if not interacting)
            this.canvas.canvasState.onStateChange = () => {
                if (this.isUserInteracting) {
                    // Queue save for later
                    this.saveQueue = true;
                } else {
                    // Save immediately with debounce
                    this.debouncedSave();
                }
            };
            
            // Debounced save to prevent excessive saves
            this.debouncedSave = this.debounce(() => {
                if (!this.isUserInteracting) {
                    this.saveToVSCode();
                }
            }, 500);
        }
    }

    saveToVSCode() {
        if (!this.canvas || !this.canvas.canvasState) return;
        
        try {
            const canvasData = this.canvas.canvasState.exportCanvasData();
            const content = JSON.stringify(canvasData, null, 2);
            
            if (window.vsCodeAPI) {
                window.vsCodeAPI.postMessage({
                    type: 'save',
                    content: content
                });
            }
        } catch (error) {
            console.error('❌ Error saving to VS Code:', error);
        }
    }

    loadCanvasContent(content) {
        if (!this.isInitialized) {
            // Store content to load after initialization
            this.pendingContent = content;
            return;
        }
        
        // Skip loading if user is currently interacting
        if (this.isUserInteracting) {
            console.log('⏸️ Skipping content load during user interaction');
            return;
        }
        
        try {
            if (content && content.trim()) {
                const canvasData = JSON.parse(content);
                if (this.canvas && this.canvas.canvasState) {
                    // Temporarily disable state change notifications during load
                    const originalOnStateChange = this.canvas.canvasState.onStateChange;
                    this.canvas.canvasState.onStateChange = null;
                    
                    this.canvas.canvasState.loadCanvasData(canvasData);
                    console.log('✅ Loaded canvas content from VS Code');
                    
                    // Force a render so visual state matches loaded data (e.g., undo color)
                    if (this.canvas.requestRender) {
                        this.canvas.requestRender();
                    } else if (this.canvas.render) {
                        this.canvas.render();
                    }
                    
                    // Re-enable state change notifications
                    this.canvas.canvasState.onStateChange = originalOnStateChange;
                }
            } else {
                console.log('📝 No content to load, starting with empty canvas');
            }
        } catch (error) {
            console.error('❌ Error loading canvas content:', error);
            // Start with empty canvas on error
        }
    }

    // Utility function for debouncing
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
}

// Make loadCanvasContent globally available for the extension
window.loadCanvasContent = (content) => {
    if (window.canvasApp) {
        window.canvasApp.loadCanvasContent(content);
    }
};

// Handle file-related messages from extension
window.addEventListener('message', event => {
    const message = event.data;
    if (!window.canvasApp || !window.canvasApp.canvas) return;
    
    const canvasState = window.canvasApp.canvas.canvasState;
    if (!canvasState) return;
    
    switch (message.type) {
        case 'fileContentLoaded':
            canvasState.updateFileContent(
                message.nodeId, 
                message.content, 
                message.lastModified
            );
            break;
        case 'fileContentSaved':
            console.log('✅ File saved successfully:', message.nodeId);
            break;
        case 'fileContentError':
            console.error('❌ File operation error:', message.error);
            canvasState.updateFileContent(
                message.nodeId, 
                message.error, 
                null
            );
            break;
    }
});

// Initialize the app
window.canvasApp = new VSCodeCanvasApp();
