# 合并「首页」与「项目」

## 判断

「首页」和「项目」是同一件事的两个入口：都是"进入一部作品"。

合并前的重复度（同一屏里）：

| 位置 | 内容 |
| :--- | :--- |
| 首页 · 侧栏 | 新建项目 / 打开项目 / 最近项目（带删除） |
| 首页 · 主区 | 新建项目 / 打开项目 / 拆解仿写 |
| 首页 · 主区 | 最近项目（与侧栏完全重复） |
| 项目 · 主区（未打开项目时） | 新建项目 / 打开项目 / 最近项目 |

四处同义内容。合并后只剩一处。

## 落地

| 动作 | 文件 |
| :--- | :--- |
| 删除两套首页 UI | `src/components/pages/WelcomePage.tsx`、`src/components/panels/sidebar/HomeSidebarPanel.tsx` |
| 左栏去掉「首页」 | `LeftToolWindowBar.tsx`（9 项 → 8 项） |
| 去掉 home 视图分支 | `EditorArea.tsx`、`Sidebar.tsx` |
| 去掉 home 视图类型 | `layout-store.ts`（`SidebarView`）、`l1-context.ts`（视图标签映射） |
| 更新检查搬进设置 | `AboutSettings.tsx` 渲染 `UpdateSection`；「关于」副标题改为「版本、更新与本地部署说明」 |
| 删除项目搬进项目树 | `ProjectTree.tsx` 标题栏新增 ⋯ 菜单：刷新项目数据 / 删除项目 |
| 最近项目移除能力保留 | `OpenProjectFirstPage.tsx` 每行 hover 出现「从最近项目移除」 |

## 合并后的行为

- **启动**：仍是「项目」（`sidebarView` 默认值本来就是 `project`）
- **没打开项目**：点「项目」= 启动页（新建 / 打开 / 最近项目）
- **已打开项目**：点「项目」= 回到小说配置

只有一个心智模型：去我的作品。

## 实机验证（1439×900 @2x）

| 截图 | 验证点 |
| :--- | :--- |
| [impl/merged-launcher.png](impl/merged-launcher.png) | 左栏 8 项、无首页；全屏唯一一处新建/打开/最近项目 |
| [impl/about-updates.png](impl/about-updates.png) | 设置 › 关于：更新卡片在版本号下方 |
| [impl/tree-menu.png](impl/tree-menu.png) | 项目树 ⋯ 菜单含「删除项目」 |

## 验证记录

- `tsc --noEmit` 退出码 0
- 全量单元测试：343 个文件通过 / 1 跳过，2950 个用例通过 / 0 失败
- 浏览器测试：`locale-shell.browser.tsx`、`OpenProjectFirstPage.recent-removal.browser.tsx` 通过
- 同步调整的测试：`LeftToolWindowBar`、`editor-snapshot`、`deletion-affordances`、`import-novel-dialog-copy`、`visual-fidelity-contract`

## 对照图

[merge-compare.png](merge-compare.png)（合并前首页 vs 合并后单入口）
