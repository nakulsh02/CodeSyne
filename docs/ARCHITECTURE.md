# 🏛️ CodeSyne Architecture & System Design

**Author**: [Nakul Sharma (@nakulsh02)](https://github.com/nakulsh02)  
**Official Portal**: [codesyne.vercel.app](https://codesyne.vercel.app)  
**Repository**: [github.com/nakulsh02/CodeSyne](https://github.com/nakulsh02/CodeSyne)

---

## High-Level Overview

CodeSyne is built as a unified cross-platform IDE engine supporting three runtime environments:
1. **Web (PWA)**: React 18, TypeScript, Monaco Editor, Tailwind CSS hosted on Vercel.
2. **Desktop (Windows 64-bit & 32-bit)**: Rust native core powered by Tauri v1.
3. **Mobile (Android)**: Capacitor native bridge with touch-optimized Monaco customizations.

---

## Core Modules

### 1. Collaborative Editing & Multi-Cursor Sync
- WebSocket real-time communication pipeline.
- Presence tracking with cursor tags, user colors, and live selection broadcasting.
- Optimistic messaging and instant friend invites.

### 2. Sandboxed Multi-Language Execution
- Instant zero-setup runners for:
  - **JavaScript / TypeScript**: Node.js sandbox
  - **Python**: Pyodide WebAssembly & container runner
  - **C / C++**: GCC compiler with memory limits
  - **Rust**: rustc container pipeline
  - **Java**: OpenJDK execution
  - **Go**: go run runtime
  - **SQL**: In-memory relational engine

### 3. AI Coding Intelligence
- Context-aware code explanations, refactoring, and automated bug diagnostics.

---

© 2026 CodeSyne by Nakul Sharma. All rights reserved.
