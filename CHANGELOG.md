# Changelog

## 0.2.1

- 同时提取 Vue `<script>` 里的中文字符串，以及 `.js`、`.mjs`、`.cjs` 文件中的中文字符串。
- 注释、`<style>`、`class`、`style`、import 路径，以及带 `${}` 的模板字符串不会替换。

## 0.1.1

- 提取时沿用已有 `en.js` 里的英文译文。
- 打开面板后自动用 DeepSeek `deepseek-chat` 翻译空的英文。翻译失败时显示原因，可以点「DeepSeek 翻译空英文」重试，也可以手动填写。

## 0.1.0

- 从 Vue 单文件组件的 `<template>` 提取中文。
- 写入 `src/i18n/lang/<模块名>/cn.js` 与 `en.js`。
- 模块名默认使用 Vue 文件名，也可以自己输入。
- 目标目录不存在时自动创建。
