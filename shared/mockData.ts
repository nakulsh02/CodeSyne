import { Project, FileSystemState, ProjectType, getSecureAvatarUrl } from './types';

export const TEMPLATES: { [key in ProjectType]: { name: string; description: string; files: FileSystemState } } = {
  web: {
    name: 'Web Playground (HTML/CSS/JS)',
    description: 'A responsive visual web page with real-time browser preview.',
    files: {
      'root': { id: 'root', name: 'root', type: 'folder', parentId: null },
      'index_html': {
        id: 'index_html',
        name: 'index.html',
        type: 'file',
        parentId: 'root',
        language: 'html',
        content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Interactive Dashboard</title>
  <style>
    body {
      font-family: 'Inter', system-ui, sans-serif;
      background: radial-gradient(circle at top left, #0f172a, #020617);
      color: #f8fafc;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      margin: 0;
      padding: 24px;
    }
    .card {
      background: rgba(30, 41, 59, 0.7);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 16px;
      padding: 32px;
      max-width: 450px;
      width: 100%;
      text-align: center;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
    }
    h1 {
      margin-top: 0;
      font-size: 2.2rem;
      background: linear-gradient(to right, #38bdf8, #818cf8);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 8px;
    }
    p {
      color: #94a3b8;
      font-size: 1rem;
      margin-bottom: 24px;
      line-height: 1.5;
    }
    .btn {
      background: linear-gradient(135deg, #6366f1, #4f46e5);
      color: white;
      border: none;
      padding: 12px 28px;
      border-radius: 8px;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    .btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 15px rgba(99, 102, 241, 0.4);
    }
    .btn:active {
      transform: translateY(0);
    }
    .counter {
      margin-top: 20px;
      font-size: 1.2rem;
      font-weight: 500;
      color: #38bdf8;
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>Collaborative App</h1>
    <p>This is a live preview of your collaborative project! Edit the code in the editor, and watch this preview auto-reload in real-time.</p>
    <button class="btn" id="clickBtn">Simulate Action</button>
    <div class="counter" id="counter">Clicked: 0 times</div>
  </div>

  <script>
    let count = 0;
    const btn = document.getElementById('clickBtn');
    const counter = document.getElementById('counter');
    
    btn.addEventListener('click', () => {
      count++;
      counter.textContent = "Clicked: " + count + " times";
      
      // Visual feedback
      btn.style.transform = 'scale(0.95)';
      setTimeout(() => btn.style.transform = '', 100);
    });
  </script>
</body>
</html>`
      },
      'dockerfile': {
        id: 'dockerfile',
        name: 'Dockerfile',
        type: 'file',
        parentId: 'root',
        language: 'dockerfile',
        content: `# Production Dockerfile for Static Web Playground
FROM nginx:alpine
COPY . /usr/share/nginx/html
EXPOSE 80
`
      },
      'vercel_json': {
        id: 'vercel_json',
        name: 'vercel.json',
        type: 'file',
        parentId: 'root',
        language: 'json',
        content: `{
  "version": 2,
  "cleanUrls": true
}`
      }
    }
  },
  javascript: {
    name: 'JavaScript Runner',
    description: 'Clean Node.js workspace for building backend utilities or algorithms.',
    files: {
      'root': { id: 'root', name: 'root', type: 'folder', parentId: null },
      'index_js': {
        id: 'index_js',
        name: 'index.js',
        type: 'file',
        parentId: 'root',
        language: 'javascript',
        content: `// Dynamic Algorithm Solver
function generateFibonacci(limit) {
  const sequence = [0, 1];
  console.log("Generating Fibonacci numbers up to limit: " + limit);
  
  while (true) {
    const nextVal = sequence[sequence.length - 1] + sequence[sequence.length - 2];
    if (nextVal > limit) break;
    sequence.push(nextVal);
  }
  
  return sequence;
}

const limit = 100;
const result = generateFibonacci(limit);
console.log("\\nSuccess! Computed Series:");
console.log(result);

// Measure performance
const memory = process.memoryUsage();
console.log("\\nMemory Allocation:");
console.log("- Heap Used: " + (memory.heapUsed / 1024 / 1024).toFixed(2) + " MB");
`
      },
      'readme_md': {
        id: 'readme_md',
        name: 'README.md',
        type: 'file',
        parentId: 'root',
        language: 'markdown',
        content: `# Node.js Algorithm Workspace

This environment is fully configured for executing JavaScript files.
Click **Run** in the toolbar to execute \`index.js\` and view live console logs.
`
      },
      'dockerfile': {
        id: 'dockerfile',
        name: 'Dockerfile',
        type: 'file',
        parentId: 'root',
        language: 'dockerfile',
        content: `# Production Dockerfile for Node.js Application
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev || true
COPY . .
EXPOSE 3000
CMD ["node", "index.js"]
`
      }
    }
  },
  typescript: {
    name: 'TypeScript Playground',
    description: 'Explore strong typing, interfaces, and classes.',
    files: {
      'root': { id: 'root', name: 'root', type: 'folder', parentId: null },
      'index_ts': {
        id: 'index_ts',
        name: 'index.ts',
        type: 'file',
        parentId: 'root',
        language: 'typescript',
        content: `// TypeScript Strong Typing Demonstration

interface User {
  id: number;
  name: string;
  role: 'Admin' | 'Developer' | 'Contributor';
  active: boolean;
}

class WorkspaceManager {
  private users: User[] = [];

  constructor(public workspaceName: string) {}

  addUser(user: User): void {
    this.users.push(user);
    console.log(\`User \${user.name} joined workspace "\${this.workspaceName}"\`);
  }

  getActiveUsers(): User[] {
    return this.users.filter(u => u.active);
  }
}

const manager = new WorkspaceManager("Cloud-SaaS-IDE");

manager.addUser({ id: 1, name: "Manju Sharma", role: "Admin", active: true });
manager.addUser({ id: 2, name: "Google AI", role: "Developer", active: true });
manager.addUser({ id: 3, name: "Guest Tester", role: "Contributor", active: false });

console.log("\\nActive Users list:");
console.log(manager.getActiveUsers());
`
      },
      'tsconfig_json': {
        id: 'tsconfig_json',
        name: 'tsconfig.json',
        type: 'file',
        parentId: 'root',
        language: 'json',
        content: `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  }
}`
      },
      'dockerfile': {
        id: 'dockerfile',
        name: 'Dockerfile',
        type: 'file',
        parentId: 'root',
        language: 'dockerfile',
        content: `# Production Dockerfile for TypeScript Application
FROM node:20-alpine
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm install
COPY . .
RUN npx tsc || true
EXPOSE 3000
CMD ["node", "index.js"]
`
      }
    }
  },
  python: {
    name: 'Python Workspace',
    description: 'Data scripts, mathematical tools, and utility files.',
    files: {
      'root': { id: 'root', name: 'root', type: 'folder', parentId: null },
      'main_py': {
        id: 'main_py',
        name: 'main.py',
        type: 'file',
        parentId: 'root',
        language: 'python',
        content: `import sys
import time

def process_data(records):
    print(f"Loading data parser... python version: {sys.version.split()[0]}")
    time.sleep(0.5)
    
    print("\\nProcessing student scores:")
    passing_students = []
    
    for student, score in records.items():
        status = "PASSED" if score >= 75 else "FAILED"
        print(f"  - {student:12} : Score {score:3} ({status})")
        if score >= 75:
            passing_students.append(student)
            
    print(f"\\nParsing complete. Passing rate: {len(passing_students)/len(records)*100:.1f}%")
    return passing_students

grades = {
    "Manju Sharma": 94,
    "Teammate AI": 100,
    "Junior Dev": 68,
    "Alice Vance": 88
}

process_data(grades)
`
      },
      'dockerfile': {
        id: 'dockerfile',
        name: 'Dockerfile',
        type: 'file',
        parentId: 'root',
        language: 'dockerfile',
        content: `# Production Dockerfile for Python Application
FROM python:3.10-slim
WORKDIR /app
COPY . .
CMD ["python", "main.py"]
`
      }
    }
  },
  golang: {
    name: 'Go Snippets',
    description: 'Run lightweight concurrent patterns and utilities.',
    files: {
      'root': { id: 'root', name: 'root', type: 'folder', parentId: null },
      'main_go': {
        id: 'main_go',
        name: 'main.go',
        type: 'file',
        parentId: 'root',
        language: 'go',
        content: `package main

import (
	"fmt"
	"time"
)

func main() {
	fmt.Println("Concurrency Showcase in Go")
	ch := make(chan string)

	go func() {
		time.Sleep(1 * time.Second)
		ch <- "Completed background operation."
	}()

	fmt.Println("Waiting for channel response...")
	msg := <-ch
	fmt.Println("Channel message received:", msg)
}
`
      },
      'dockerfile': {
        id: 'dockerfile',
        name: 'Dockerfile',
        type: 'file',
        parentId: 'root',
        language: 'dockerfile',
        content: `# Production Dockerfile for Go Application
FROM golang:1.20-alpine AS builder
WORKDIR /app
COPY . .
RUN go build -o main .

FROM alpine:latest
WORKDIR /app
COPY --from=builder /app/main .
CMD ["./main"]
`
      }
    }
  },
  rust: {
    name: 'Rust Playground',
    description: 'Safe memory safety patterns and speed execution simulations.',
    files: {
      'root': { id: 'root', name: 'root', type: 'folder', parentId: null },
      'main_rs': {
        id: 'main_rs',
        name: 'main.rs',
        type: 'file',
        parentId: 'root',
        language: 'rust',
        content: `fn main() {
    println!("Welcome to the Collaborative Rust Playground!");
    
    let numbers = vec![1, 2, 3, 4, 5];
    let sum: i32 = numbers.iter().sum();
    
    println!("Summing array numbers: {:?}", numbers);
    println!("Resulting sum value: {}", sum);
}
`
      },
      'dockerfile': {
        id: 'dockerfile',
        name: 'Dockerfile',
        type: 'file',
        parentId: 'root',
        language: 'dockerfile',
        content: `# Production Dockerfile for Rust Application
FROM rust:1.68-slim AS builder
WORKDIR /app
COPY . .
RUN rustc main.rs -o main

FROM debian:bookworm-slim
WORKDIR /app
COPY --from=builder /app/main .
CMD ["./main"]
`
      }
    }
  },
  java: {
    name: 'Java Workspace',
    description: 'Write robust and performant object-oriented Java code.',
    files: {
      'root': { id: 'root', name: 'root', type: 'folder', parentId: null },
      'main_java': {
        id: 'main_java',
        name: 'Main.java',
        type: 'file',
        parentId: 'root',
        language: 'java',
        content: `public class Main {
    public static void main(String[] args) {
        System.out.println("Hello from the Java Environment!");
        
        int limit = 10;
        int sum = 0;
        for (int i = 1; i <= limit; i++) {
            sum += i;
        }
        
        System.out.println("The sum of integers from 1 to " + limit + " is: " + sum);
        System.out.println("JVM Vendor: " + System.getProperty("java.vendor"));
    }
}
`
      },
      'dockerfile': {
        id: 'dockerfile',
        name: 'Dockerfile',
        type: 'file',
        parentId: 'root',
        language: 'dockerfile',
        content: `# Production Dockerfile for Java Application
FROM openjdk:17-slim AS builder
WORKDIR /app
COPY . .
RUN javac Main.java

FROM openjdk:17-slim
WORKDIR /app
COPY --from=builder /app/*.class .
CMD ["java", "Main"]
`
      }
    }
  },
  c: {
    name: 'C Sandbox',
    description: 'Compile low-level structures and system logic in C.',
    files: {
      'root': { id: 'root', name: 'root', type: 'folder', parentId: null },
      'main_c': {
        id: 'main_c',
        name: 'main.c',
        type: 'file',
        parentId: 'root',
        language: 'c',
        content: `#include <stdio.h>

int main() {
    printf("Welcome to the C Compilation Sandbox!\\n");
    
    int a = 42;
    int b = 137;
    int sum = a + b;
    
    printf("Calculating integer addition: %d + %d = %d\\n", a, b, sum);
    return 0;
}
`
      },
      'dockerfile': {
        id: 'dockerfile',
        name: 'Dockerfile',
        type: 'file',
        parentId: 'root',
        language: 'dockerfile',
        content: `# Production Dockerfile for C Application
FROM gcc:latest AS builder
WORKDIR /app
COPY . .
RUN gcc -o main main.c

FROM debian:bookworm-slim
WORKDIR /app
COPY --from=builder /app/main .
CMD ["./main"]
`
      }
    }
  },
  cpp: {
    name: 'C++ Playground',
    description: 'Modern object-oriented structures and Standard Template Library.',
    files: {
      'root': { id: 'root', name: 'root', type: 'folder', parentId: null },
      'main_cpp': {
        id: 'main_cpp',
        name: 'main.cpp',
        type: 'file',
        parentId: 'root',
        language: 'cpp',
        content: `#include <iostream>
#include <vector>
#include <numeric>

int main() {
    std::cout << "C++ Standard Library Execution Simulation" << std::endl;
    
    std::vector<int> data = {10, 20, 30, 40, 50};
    int total = std::accumulate(data.begin(), data.end(), 0);
    
    std::cout << "Summing vector: ";
    for (int num : data) {
        std::cout << num << " ";
    }
    std::cout << "\\nTotal accumulated sum: " << total << std::endl;
    
    return 0;
}
`
      },
      'dockerfile': {
        id: 'dockerfile',
        name: 'Dockerfile',
        type: 'file',
        parentId: 'root',
        language: 'dockerfile',
        content: `# Production Dockerfile for C++ Application
FROM gcc:latest AS builder
WORKDIR /app
COPY . .
RUN g++ -o main main.cpp

FROM debian:bookworm-slim
WORKDIR /app
COPY --from=builder /app/main .
CMD ["./main"]
`
      }
    }
  },
  php: {
    name: 'PHP Shell',
    description: 'Dynamic scripting, string manipulation, and system utilities.',
    files: {
      'root': { id: 'root', name: 'root', type: 'folder', parentId: null },
      'index_php': {
        id: 'index_php',
        name: 'index.php',
        type: 'file',
        parentId: 'root',
        language: 'php',
        content: `<?php
echo "Hello from the Dynamic PHP Scripting Runner!\\n\\n";

$users = ["Manju Sharma", "Sarah Connor", "Alex Rivera"];
echo "Staging active collaborators list:\\n";
foreach ($users as $index => $user) {
    echo "  - [" . ($index + 1) . "] " . $user . "\\n";
}

echo "\\nPHP Engine Version: " . phpversion() . "\\n";
?>
`
      },
      'dockerfile': {
        id: 'dockerfile',
        name: 'Dockerfile',
        type: 'file',
        parentId: 'root',
        language: 'dockerfile',
        content: `# Production Dockerfile for PHP Application
FROM php:8.2-cli-alpine
WORKDIR /app
COPY . .
CMD ["php", "index.php"]
`
      }
    }
  },
  swift: {
    name: 'Swift Playground',
    description: 'Apple ecosystem language for iOS, macOS, and server-side Swift.',
    files: {
      'root': { id: 'root', name: 'root', type: 'folder', parentId: null },
      'main_swift': {
        id: 'main_swift',
        name: 'main.swift',
        type: 'file',
        parentId: 'root',
        language: 'swift',
        content: `import Foundation

print("Swift High-Performance Language Runner!")

let items = ["Swift", "iOS", "macOS", "Server Swift"]
print("Supported Platforms:")
for (index, item) in items.enumerated() {
    print("  \(index + 1). \(item)")
}
`
      }
    }
  },
  kotlin: {
    name: 'Kotlin Scripting',
    description: 'Modern concise JVM language for Android and backend microservices.',
    files: {
      'root': { id: 'root', name: 'root', type: 'folder', parentId: null },
      'main_kts': {
        id: 'main_kts',
        name: 'main.kts',
        type: 'file',
        parentId: 'root',
        language: 'kotlin',
        content: `println("Kotlin Multiplatform Execution Runner!")

val frameworks = listOf("Android", "Ktor", "Spring Boot", "Multiplatform")
println("Core Ecosystem Features:")
frameworks.forEachIndexed { index, name ->
    println("  [\${index + 1}] $name")
}
`
      }
    }
  },
  ruby: {
    name: 'Ruby Scripting',
    description: 'Expressive object-oriented language for web APIs and scripting.',
    files: {
      'root': { id: 'root', name: 'root', type: 'folder', parentId: null },
      'main_rb': {
        id: 'main_rb',
        name: 'main.rb',
        type: 'file',
        parentId: 'root',
        language: 'ruby',
        content: `puts "Ruby Script Execution Environment!"

features = ["Ruby on Rails", "Expressive Syntax", "Gems Ecosystem", "Metaprogramming"]
puts "Key Ruby Highlights:"
features.each_with_index do |feat, idx|
  puts "  - #{idx + 1}. #{feat}"
end
`
      }
    }
  },
  csharp: {
    name: 'C# / .NET Core',
    description: 'Enterprise cross-platform C# environment for web services and applications.',
    files: {
      'root': { id: 'root', name: 'root', type: 'folder', parentId: null },
      'Program_cs': {
        id: 'Program_cs',
        name: 'Program.cs',
        type: 'file',
        parentId: 'root',
        language: 'csharp',
        content: `using System;

class Program
{
    static void Main()
    {
        Console.WriteLine("C# / .NET Core Execution Runner!");
        string[] tech = { "ASP.NET Core", "Blazor", "Entity Framework", "LINQ" };
        Console.WriteLine("Stack Components:");
        for (int i = 0; i < tech.Length; i++)
        {
            Console.WriteLine($"  [{i + 1}] {tech[i]}");
        }
    }
}
`
      }
    }
  },
  dart: {
    name: 'Dart Environment',
    description: 'Client-optimized language for Flutter and fast multiplatform development.',
    files: {
      'root': { id: 'root', name: 'root', type: 'folder', parentId: null },
      'main_dart': {
        id: 'main_dart',
        name: 'main.dart',
        type: 'file',
        parentId: 'root',
        language: 'dart',
        content: `void main() {
  print('Dart / Flutter Execution Environment!');

  final modules = ['Flutter Mobile', 'Flutter Web', 'Dart Frog Backend', 'Sound Null Safety'];
  print('Dart Features:');
  for (var i = 0; i < modules.length; i++) {
    print('  - \${i + 1}. \${modules[i]}');
  }
}
`
      }
    }
  },
  scala: {
    name: 'Scala Environment',
    description: 'Functional and object-oriented JVM language for big data and distributed systems.',
    files: {
      'root': { id: 'root', name: 'root', type: 'folder', parentId: null },
      'Main_scala': {
        id: 'Main_scala',
        name: 'Main.scala',
        type: 'file',
        parentId: 'root',
        language: 'scala',
        content: `object Main extends App {
  println("Scala Functional & Object-Oriented Runner!")

  val topics = List("Apache Spark", "Akka / Pekko", "Pattern Matching", "Strong Type Inference")
  println("Scala Capabilities:")
  topics.zipWithIndex.foreach { case (topic, idx) =>
    println(s"  [\${idx + 1}] $topic")
  }
}
`
      }
    }
  },
  r: {
    name: 'R Scripting',
    description: 'Statistical computing and graphics environment for data science and analysis.',
    files: {
      'root': { id: 'root', name: 'root', type: 'folder', parentId: null },
      'script_r': {
        id: 'script_r',
        name: 'script.R',
        type: 'file',
        parentId: 'root',
        language: 'r',
        content: `cat("R Statistical Computing Execution Runner!\\n\\n")

data <- c(12, 24, 36, 48, 60)
cat("Sample vector sum:", sum(data), "\\n")
cat("Sample vector mean:", mean(data), "\\n")
`
      }
    }
  }
};

export const MOCK_PROJECTS: Project[] = [];

export const COLLAB_BOTS = [
  { id: 'bot_1', name: 'Sarah Connor', color: '#10b981', avatar: getSecureAvatarUrl('sarah@codesyne.app', 'Sarah Connor') },
  { id: 'bot_2', name: 'Alex Rivera', color: '#ec4899', avatar: getSecureAvatarUrl('alex@codesyne.app', 'Alex Rivera') },
  { id: 'bot_3', name: 'Luna Dev', color: '#8b5cf6', avatar: getSecureAvatarUrl('luna@codesyne.app', 'Luna Dev') }
];

export const FAQS = [
  {
    question: "How does real-time collaboration work in this Cloud IDE?",
    answer: "It utilizes modern WebSocket channels to broadcast cursor positions, text selection ranges, typing indicators, active files, and terminal events to all connected clients instantly. This allows google-doc style simultaneous editing without conflicts."
  },
  {
    question: "Can I run backend languages like Python or Rust?",
    answer: "Yes! The IDE supports running code natively. Python and JavaScript run in highly secure server-side environments, with real-time console streaming directly back to your IDE terminal pane."
  },
  {
    question: "Is there built-in AI assistance?",
    answer: "Absolutely. The IDE features an integrated Gemini AI assistant powered by the server-side gemini-3.5-flash model. You can prompt the assistant to generate complete scripts, explain complicated codes, fix compiler errors, refactor code, and write unit tests."
  },
  {
    question: "Can I import and export local directories?",
    answer: "Yes, you can import files or folders by dragging and dropping them into the workspace, or uploading a single ZIP file. You can also export your entire workspace at any time as a single ZIP with one click."
  }
];

export const TESTIMONIALS = [
  {
    name: "Elena Rostova",
    role: "Senior Software Architect, Vercel",
    text: "The responsiveness of this browser-based IDE is incredible. Loading projects takes fractions of a second, and the integrated visual preview is a absolute game-changer.",
    avatar: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=256&q=80"
  },
  {
    name: "Devon Patel",
    role: "Full Stack Lead, Replit",
    text: "I was skeptical about web-based collaboration, but the cursors and real-time chat feel incredibly smooth. The server-side Gemini AI helps explain functions in real time.",
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&q=80"
  },
  {
    name: "Krystal Vance",
    role: "Lead UI Designer, Figma",
    text: "The dark theme, typography balance, and glassmorphism navbar details show a mastery of modern user interface design. It is gorgeous and highly functional.",
    avatar: "https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=256&q=80"
  }
];
