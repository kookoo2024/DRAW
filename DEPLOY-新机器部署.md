# Excalidraw 局域网版 — 新机器部署指南

把整套"魔改 Excalidraw + 素材库 + FireCloud"部署到一台新机器。

---

## 前提条件

新机器需要装好：
1. **Node.js 18+**（含 npm/yarn）—— 下载 https://nodejs.org
2. **Git** —— 下载 https://git-scm.com
3. **Go 1.21+**（仅当需要重编译 FireCloud 时）—— 下载 https://go.dev

---

## 部署步骤

### 第 1 步：准备 D:\Fire 目录

FireCloud 的根目录写死是 `D:\Fire`（端口 80）。新机器上创建：

```
D:\Fire\
```

> 如果想用别的盘/目录，需要改 FireCloud 源码 main.go 第 32-33 行的 `rootDir` 和 `listenAddr`，然后重编译。

### 第 2 步：放 FireCloud.exe

把 `FireCloud.exe`（含 `/api/upload`、`/api/delete` 等接口的版本）放到任意位置，比如：

```
D:\FireCloud\FireCloud.exe
```

> exe 来源：从旧机器的 `FireCloud.exe` 拷贝，
> 或从 FireCloud 源码编译：
> ```
> go build -ldflags "-H windowsgui" -o FireCloud.exe .
> ```
> 注意：`-ldflags "-H windowsgui"` 必须加，否则启动会弹出黑色控制台窗口。

### 第 3 步：拉取 Excalidraw 代码

```
git clone https://github.com/kookoo2024/DRAW.git D:\Fire\excalidraw
cd D:\Fire\excalidraw
yarn install
```

> 如果新机器无法访问 GitHub，用代理：
> ```
> git config --global http.proxy http://127.0.0.1:7890
> ```

### 第 4 步：构建并部署前端

双击 `deploy.bat`，或手动：

```
cd D:\Fire\excalidraw\excalidraw-app
yarn build:local
```

构建产物在 `excalidraw-app\build\`，需要拷贝到 `D:\Fire\draw\`：

```
xcopy D:\Fire\excalidraw\excalidraw-app\build\* D:\Fire\draw\ /e /y /i
```

### 第 5 步：准备素材库目录

创建 `D:\Fire\libraries\`，放入素材库文件（每个分类一个 .excalidrawlib）：

```
D:\Fire\libraries\
  通用.excalidrawlib      ← 素材文件
  数学.excalidrawlib
  index.json              ← 拖拽排序的顺序记录（可选，没有会按拼音排）
```

> 从旧机器的 `D:\Fire\libraries\` 整个拷过来即可。

### 第 6 步：启动 FireCloud

```
D:\FireCloud\FireCloud.exe
```

启动后，浏览器访问验证：
- 本机：`http://localhost/draw/`
- 局域网：`http://你的IP/draw/`（其他设备用这个）

---

## 访问方式

| 场景 | 网址 |
|------|------|
| 本机 | `http://localhost/draw/` |
| 局域网（其他电脑/手机） | `http://192.168.x.x/draw/`（你的局域网 IP） |
| 域名（如果有） | `https://home.150700.xyz/draw/` |

> 首次访问后，**Ctrl+Shift+R 硬刷新**清掉缓存。

---

## 完整目录结构（部署后）

```
D:\Fire\
├── FireCloud.exe（放哪都行，能启动即可，比如 D:\FireCloud\）
├── draw\                    ← Excalidraw 前端（FireCloud 静态托管）
│   ├── index.html
│   └── assets\
├── libraries\               ← 素材库分类文件
│   ├── 通用.excalidrawlib
│   ├── 数学.excalidrawlib
│   └── index.json           ← 排序记录
├── excalidraw\              ← 源码（开发用，部署后可不保留）
│   ├── deploy.bat
│   └── excalidraw-app\
└── （其他 FireCloud 托管的文件：试卷、图片等，按需）
```

---

## 一键部署脚本（代码更新后用）

改了代码后，重新构建部署，双击 `D:\Fire\excalidraw\deploy.bat` 即可。

---

## 常见问题

### Q: 访问 draw/ 白屏？
A: Ctrl+Shift+R 硬刷新，或 F12 → Application → Clear site data。

### Q: 素材库标签不显示？
A: 确认 `D:\Fire\libraries\` 目录存在且有 .excalidrawlib 文件。

### Q: 删除分类失败？
A: 确认用的是**新版** FireCloud.exe（含 /api/delete 接口）。

### Q: 端口 80 被占用？
A: 关掉占用 80 的程序（IIS、Skype 等），或改 FireCloud 端口后重编译。

### Q: 新机器访问不了 GitHub？
A: 配代理后 git clone；或从旧机器打包 `excalidraw` 目录拷过来。
