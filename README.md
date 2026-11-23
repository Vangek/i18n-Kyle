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

提取完成后会自动使用当前 VS Code 可用的语言模型翻译英文，并回填到表格；已有 `en.js` 译文会沿用。首次使用可能会出现 VS Code 的模型授权提示，中文模板文本会发送给所选模型。写入前请检查并按需修改。没有可用模型或翻译失败时，面板会显示原因，可点击 **AI 翻译空英文** 重试或手动填写。

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

## 打包与发布

VS Code 的 publisher 是 `KaiWang`，Cursor 的 publisher 是 `Vangek`。执行 `npm run package` 时会先要求选择目标商店。完整步骤写在项目里的 `PUBLISH.md`。
