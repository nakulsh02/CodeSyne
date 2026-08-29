<div align="center">

# ⚡ CodeSyne

### Real-Time Collaborative Cloud IDE & Multi-Language Execution Studio with AI Intelligence

[![Live Demo](https://img.shields.io/badge/Live%20Demo-codesyne.vercel.app-06b6d4?style=for-the-badge&logo=vercel)](https://codesyne.vercel.app)
[![GitHub Stars](https://img.shields.io/github/stars/nakulsh02/CodeSyne?style=for-the-badge&logo=github&color=gold)](https://github.com/nakulsh02/CodeSyne/stargazers)
[![License: MIT](https://img.shields.io/badge/License-MIT-8B5CF6?style=for-the-badge)](./LICENSE)
[![React](https://img.shields.io/badge/React-18.3-61DAFB?style=for-the-badge&logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org)
[![Tauri & Rust](https://img.shields.io/badge/Desktop-Tauri%20%26%20Rust-FFC107?style=for-the-badge&logo=tauri)](https://tauri.app)
[![Android](https://img.shields.io/badge/Mobile-Android%20Native-3DDC84?style=for-the-badge&logo=android)](https://github.com/nakulsh02/CodeSyne/releases)

<br/>

**CodeSyne** is a high-performance, next-generation collaborative cloud development environment designed for modern engineers, teams, and learners. It combines instant zero-setup multi-language code execution, AI-powered intelligence, and real-time multiplayer pair programming into a unified experience across Web, Windows Desktop, and Android.

[🚀 Launch Web IDE](https://codesyne.vercel.app) • [📥 Official Downloads](#-official-download-links) • [✨ Key Features](#-key-features) • [🛠️ Tech Stack](#️-tech-stack) • [🤝 Contributing](#-contribution-guidelines)

<br/>

<img src="https://codesyne.vercel.app/apple-touch-icon.png" alt="CodeSyne Logo" width="110" />

</div>

---

## 📸 Interface Preview

```
 _________________________________________________________________________
| [📁 File Tree] | ⚡ main.py                     | 🤖 AI Companion & Chat   |
| ├── src/      | 1  import asyncio             | > Refactored sorting loop|
| └── app.ts    | 2  async def start_server():  | > Time complexity: O(N)  |
|               | 3      print("CodeSyne v1.2") |                          |
|_______________|_______________________________|__________________________|
| 📟 Interactive Sandboxed Terminal (JS, Python, C++, Rust, Java, Go, SQL) |
| $ python main.py -> Executed in 12ms (Exit Code: 0)                     |
|_________________________________________________________________________|
```

---

## ✨ Key Features

- 👥 **Real-Time Multiplayer Collaboration** — Code together seamlessly with live multi-cursor tracking, shared workspace rooms, real-time presence indicators, and synchronized editing.
- ⚡ **Zero-Setup Multi-Language Code Execution** — Run JavaScript, TypeScript, Python, C++, Java, Rust, Go, HTML/CSS, and SQL instantly in a sandboxed, low-latency cloud execution environment.
- 🤖 **AI-Powered Code Intelligence** — Integrated context-aware AI coding companion for instant bug detection, smart refactoring suggestions, auto-completion, and code explanations.
- 🎨 **Monaco Editor Core** — Desktop-grade code editing with rich syntax highlighting, bracket matching, code folding, multi-selection, and customizable themes.
- 💻 **Cross-Platform Native Desktop Apps** — Ultra-lightweight Windows 64-bit and 32-bit standalone desktop installers built with Rust and Tauri (consumes <25 MB RAM).
- 📱 **Adaptive Android Client** — Touch-optimized layout, mobile virtual keyboard enhancements, and quick snippet access on smartphones and tablets.
- 💾 **Local & Cloud Workspace Sync** — Organize multi-file project directories, download zips, and persist your code securely.

---

## 📥 Official Download Links

| Platform | Format | Architecture | Direct Download Link | Supported OS |
| :--- | :--- | :--- | :--- | :--- |
| **🪟 Windows (64-bit)** | `.exe` Installer | `x64` | [**Download 64-bit EXE**](https://github.com/nakulsh02/CodeSyne/releases/download/v1.2.0/CodeSyne_1.2.0_x64-setup.exe) | Windows 7 SP1, 8, 8.1, 10, 11 (64-bit) |
| **🪟 Windows (32-bit)** | `.exe` Installer | `x86` | [**Download 32-bit EXE**](https://github.com/nakulsh02/CodeSyne/releases/download/v1.2.0/CodeSyne_1.2.0_x86-setup.exe) | Windows 7 SP1, 8, 8.1, 10 (32-bit) |
| **🤖 Android Native** | `.apk` Package | `Universal` | [**Download Android APK**](https://github.com/nakulsh02/CodeSyne/releases/download/v1.2.0/CodeSyne-v1.2.0.apk) | Android 8.0 (Oreo) to Android 15 |
| **🌐 Web App (PWA)** | Cloud Web App | `Universal` | [**Open codesyne.vercel.app**](https://codesyne.vercel.app) | Chrome, Edge, Brave, Safari, Firefox |

---

## 🛠️ Tech Stack

- **Frontend**: React 18, TypeScript, Tailwind CSS, Lucide Icons, Monaco Editor (`@monaco-editor/react`)
- **Backend & APIs**: Node.js, Express, WebSocket Real-Time Engine
- **Desktop Architecture**: Tauri & Rust Native Runtime
- **Mobile Architecture**: Capacitor & Android Native SDK
- **Deployment & CI/CD**: Vercel (Web), GitHub Actions (Windows `.exe` & Android `.apk` automated release pipelines)

---

## 🚀 Getting Started & Installation

### Option 1: Web App (Zero Setup)
Simply visit [**codesyne.vercel.app**](https://codesyne.vercel.app) in any modern web browser to start coding immediately.

### Option 2: Windows Desktop Installation
1. Download `CodeSyne_1.2.0_x64-setup.exe` (or `x86` for 32-bit systems) from [Releases](https://github.com/nakulsh02/CodeSyne/releases).
2. Double-click the installer and complete the setup wizard.
3. Launch **CodeSyne** from your Start Menu or Desktop shortcut.

### Option 3: Android App Installation
1. Download `CodeSyne-v1.2.0.apk` from [Releases](https://github.com/nakulsh02/CodeSyne/releases).
2. Open the downloaded `.apk` on your Android device and tap **Install**.

---

## 🤝 Contribution Guidelines

Contributions are welcome! If you would like to help improve CodeSyne:

1. **Fork the Repository** on GitHub.
2. **Create a Feature Branch**:
   ```bash
   git checkout -b feature/amazing-feature
   ```
3. **Commit your Changes**:
   ```bash
   git commit -m "Add amazing feature"
   ```
4. **Push to the Branch**:
   ```bash
   git push origin feature/amazing-feature
   ```
5. **Open a Pull Request** describing your enhancements.

Please feel free to check the [Issues page](https://github.com/nakulsh02/CodeSyne/issues) if you have any questions or ideas.

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](./LICENSE) file for details.

---

<div align="center">
  <sub>Created with ❤️ by <b>Nakul Sharma</b> • © 2026 CodeSyne</sub>
</div>
