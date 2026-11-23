# i18n Kyle

从 Vue 单文件组件的 `<template>` 里提取中文，生成下面这种语言包：

```text
src/i18n/lang/footer/cn.js
src/i18n/lang/footer/en.js
```

`cn.js` 的内容类似：

```js
export default {
  brandName: '伊伊之',
  brandCaption: '旅行计划',
  description: '世界很大，值得亲自感受。\n让每一趟旅行，都有值得期待的体验。',
  explore: '开始探索'
}
```

`en.js` 使用同一组键。英文留空，也可以在写入前自己填。

这个扩展使用 VS Code 扩展格式，可以安装到 VS Code，也可以安装到 Cursor。Cursor 扩展商店读取的是 Open VSX 上的同一份扩展。

## 使用

1. 打开一个 `.vue` 文件，或在资源管理器里选中它。
2. 运行命令 **i18n Kyle: 提取 Template 中文到 i18n**。也可以在 `.vue` 文件上点右键，选择同一条命令。
3. 语言文件名默认是这个 Vue 文件的名字：`Footer.vue` 会得到 `footer`，`index.vue` 会用它所在文件夹的名字。可以改成别的名字。
4. 确认键名和英文后，点击 **写入语言文件**。

没有 `src/i18n/lang` 时会自动创建。扩展会找到该 Vue 文件所属的最近一层 `src`；项目里还没有 `src` 时，就在项目根目录下创建。

相同的中文只生成一个键。键名默认由拼音转成驼峰，例如「开始探索」会变成 `kaiShiTanSuo`。建议改成 `explore` 这样的语义化名字。已经存在于 `cn.js` 里的同一句中文会沿用原来的键，已有译文不会被覆盖。

勾选「同时把 template 中的中文替换为 i18n 调用」后，模板会变成：

```vue
<button :title="$t('footer.explore')">{{ $t('footer.explore') }}</button>
```

替换发生在编辑器里，可以用撤销还原。函数名可以在设置 `i18nKyle.i18nFunction` 里修改，默认是 `$t`。

只处理 HTML `<template>`。`<script>`、`<style>`、注释、`class` 和 `style` 属性里的中文不会提取。`lang="pug"` 这类模板会提示暂不支持。

## 本地调试

```bash
npm install
npm test
npm run build
```

在 VS Code 或 Cursor 里打开本项目，按 F5（运行扩展），会打开一个扩展开发窗口。在那个窗口里打开任意 Vue 项目即可试用。

## 打包

```bash
npm run package
```

会生成 `i18n-kyle-0.1.0.vsix`。可以把它拖进 VS Code 或 Cursor 的扩展面板安装。

发布前把 `package.json` 里的 `publisher` 改成你自己的发布者 ID。VS Code 商店和 Open VSX 使用同一个 `publisher` 和 `name`，扩展 ID 才一致。

## 发布到 VS Code 扩展商店

1. 用 Microsoft 账号登录 [Visual Studio Marketplace 管理页](https://marketplace.visualstudio.com/manage)，创建一个 Publisher。ID 一旦创建不能修改。
2. 把 `package.json` 的 `publisher` 设成这个 ID。
3. 推荐用 GitHub Actions 的 Trusted Publishing：在发布者页面创建 Trusted Publishing 策略，工作流里执行 `vsce publish --no-dependencies --allow-missing-repository`。如果还没有 GitHub 仓库，可以先用 Azure DevOps 的 Marketplace PAT 本地执行 `npm run publish:vscode`。全局 PAT 将在 2027-01-27 后失效，长期发布请改用 Trusted Publishing。
4. 也可以在管理页手动上传 `npm run package` 生成的 vsix。

## 发布到 Cursor 扩展商店

Cursor 的扩展商店来自 [Open VSX](https://open-vsx.org/)。发布到 Open VSX 后，Cursor 才会在扩展搜索里显示它。

1. 注册 Eclipse 账号，并填好与 Open VSX 相同的 GitHub 用户名。
2. 用 GitHub 登录 Open VSX，在个人设置里关联 Eclipse 账号并同意 Publisher Agreement。
3. 在 Open VSX 生成 Access Token。
4. 创建与 `publisher` 同名的命名空间，并发布同一份 vsix：

```bash
npx ovsx create-namespace kyle -p "$OVSX_PAT"
npm run package
npx ovsx publish i18n-kyle-0.1.0.vsix -p "$OVSX_PAT"
```

`npm run publish:cursor` 会在已登录的前提下直接发布当前目录。Open VSX 要求扩展带有许可证，本项目使用 MIT。
