# 发布

VS Code 和 Cursor 使用不同的发布者，不能共用同一个安装包。执行 `npm run package` 时会先询问目标商店，并只在打包过程中临时写入对应的 `publisher`。完成后 `package.json` 会恢复成原来的内容。

| 商店 | 命令输入 | publisher | 生成的安装包 |
| --- | --- | --- | --- |
| VS Code | `vscode` | `KaiWang` | `i18n-kyle-vscode-<版本>.vsix` |
| Cursor | `cursor` | `Vangek` | `i18n-kyle-cursor-<版本>.vsix` |

当前版本是 `0.1.1`，所以文件名是 `i18n-kyle-vscode-0.1.1.vsix` 和 `i18n-kyle-cursor-0.1.1.vsix`。

## 打包

```bash
npm run package
```

提示出现后输入 `vscode` 或 `cursor`。已经确定目标时可以直接：

```bash
npm run package -- vscode
npm run package -- cursor
```

## 上传到 VS Code

1. 先执行 `npm run package`，并选择 `vscode`。
2. 打开 [Kai Wang 的扩展管理页](https://marketplace.visualstudio.com/manage/publishers/kaiwang)。
3. 点 **+ New extension**，选择 **Visual Studio Code**。不要选 Visual Studio。
4. 上传 `i18n-kyle-vscode-0.1.1.vsix`。已发布过的扩展不要再点 **+ New extension**，在列表里打开 **i18n Kyle**，选择更新并上传这个新版本。
5. 版本显示 **Verifying** 时表示正在扫描。变成绿色勾之后，VS Code 扩展商店里才能搜到。

网页上传依赖 Google reCAPTCHA。如果控制台出现 `grecaptcha is not defined`，先让浏览器能访问 Google，再重新上传。

## 上传到 Cursor

Cursor 读取 Open VSX。先执行 `npm run package`，并选择 `cursor`，然后发布到已经创建的 `Vangek` 命名空间：

```bash
npx ovsx publish i18n-kyle-cursor-0.1.1.vsix -p "你的 Open VSX token"
```

扫描通过后，在 Cursor 扩展搜索里找 **i18n Kyle**，发布者是 `Vangek`。

两个商店的扩展 ID 不同：VS Code 是 `KaiWang.i18n-kyle`，Cursor 是 `Vangek.i18n-kyle`。
