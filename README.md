# i18n Kyle

从 Vue 单文件组件的 `<template>`、`<script>`，以及 `.js` / `.mjs` / `.cjs` 文件里提取中文，生成下面这种语言包：

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

1. 打开一个 `.vue`、`.js`、`.mjs` 或 `.cjs` 文件，或在资源管理器里选中它。
2. 运行命令 **i18n Kyle: 提取中文到 i18n**。也可以在这些文件上点右键，选择同一条命令。
3. 语言文件名默认是这个文件的名字：`Footer.vue` 会得到 `footer`，`index.vue` 和 `index.js` 会用它所在文件夹的名字。可以改成别的名字。
4. 确认键名和英文后，点击 **写入语言文件**。

提取完成后会自动通过 DeepSeek `deepseek-chat` 将中文翻译成英文，并回填到表格；已有 `en.js` 译文会沿用。提取到的中文会发送给 DeepSeek，写入前请检查并按需修改。未配置 Key 或翻译失败时，面板会显示原因，可点击 **DeepSeek 翻译空英文** 重试或手动填写。

### 设置 DeepSeek API Key

这条命令不在右键菜单里，要从命令面板运行。请在已经安装并启用本扩展的窗口里操作。如果当前窗口只是在修改插件源码，命令不会出现，需要先按 F5 打开扩展开发窗口，或安装打好的安装包。

1. 按 `Cmd+Shift+P`（Windows / Linux 为 `Ctrl+Shift+P`）打开命令面板。
2. 输入 `设置 DeepSeek` 或 `i18n Kyle`。
3. 选择 **i18n Kyle: 设置 DeepSeek API Key**。
4. 在弹出的输入框里粘贴 DeepSeek API Key，按回车。

保存成功后，右下角会提示「DeepSeek API Key 已安全保存。」Key 保存在 VS Code 的 SecretStorage 中。之后再提取中文，空的英文会用这个 Key 去翻译。

没有 `src/i18n/lang` 时会自动创建。扩展会找到该文件所属的最近一层 `src`；项目里还没有 `src` 时，就在项目根目录下创建。

相同的中文只生成一个键。键名默认由拼音转成驼峰，例如「开始探索」会变成 `kaiShiTanSuo`。建议改成 `explore` 这样的语义化名字。已经存在于 `cn.js` 里的同一句中文会沿用原来的键，已有译文不会被覆盖。

勾选「同时把选中的中文替换为 i18n 调用」后，模板文本会变成 `{{ $t(...) }}`，普通属性会变成绑定属性。`<script>` 和 JavaScript 文件里的字符串会直接换成函数调用：

```vue
<button :title="$t('footer.explore')">{{ $t('footer.explore') }}</button>
```

```js
const label = $t('footer.explore')
```

替换发生在编辑器里，可以用撤销还原。函数名可以在设置 `i18nKyle.i18nFunction` 里修改，默认是 `$t`。

`<template>` 只处理 HTML。`lang="pug"` 这类模板会跳过；文件里还有 `<script>` 时，仍会提取脚本中的字符串。`<style>`、注释、`class` 和 `style` 属性里的中文不会提取。

`<script>` 和 JavaScript 文件只提取引号或反引号里的中文字符串。下面这些会跳过：

- 注释，以及 `import` / `require` 的模块路径
- 已经写在 `t()`、`$t()` 里的字符串
- 带 `${}` 的模板字符串。面板会提示这一处没有提取，字符串内部的中文仍会提取

不在字符串里的中文（例如变量名、JSX 文本）不会替换，面板会给出提示。

## 本地调试

```bash
npm install
npm test
npm run build
```

在 VS Code 或 Cursor 里打开本项目，按 F5（运行扩展），会打开一个扩展开发窗口。在那个窗口里打开任意 Vue 或 JavaScript 文件即可试用。

## 打包与发布

VS Code 的 publisher 是 `KaiWang`，Cursor 的 publisher 是 `Vangek`。执行 `npm run package` 时会先要求选择目标商店。完整步骤写在项目里的 `PUBLISH.md`。
