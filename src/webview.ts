export function getWebviewHtml(nonce: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>提取 Vue 中文</title>
  <style nonce="${nonce}">
    :root { color-scheme: light dark; }
    body {
      margin: 0;
      padding: 20px 22px 28px;
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      line-height: 1.5;
    }
    h1 { font-size: 16px; font-weight: 600; margin: 0 0 6px; }
    .muted { color: var(--vscode-descriptionForeground); }
    .source { margin: 0 0 16px; word-break: break-all; }
    label { display: block; font-weight: 600; margin-bottom: 6px; }
    input[type="text"], textarea {
      width: 100%;
      box-sizing: border-box;
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border, transparent);
      border-radius: 4px;
      font-family: var(--vscode-editor-font-family, var(--vscode-font-family));
      font-size: 13px;
    }
    input[type="text"] { height: 30px; padding: 0 8px; }
    textarea { min-height: 52px; padding: 6px 8px; resize: vertical; }
    .field { margin-bottom: 14px; }
    .path {
      margin-top: 6px;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 12px;
    }
    .check { display: flex; gap: 8px; align-items: flex-start; font-weight: 400; margin: 8px 0 14px; }
    .check input { margin-top: 3px; }
    .toolbar { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
    .toolbar button { min-height: 28px; }
    button {
      height: 28px;
      padding: 0 12px;
      border: 0;
      border-radius: 4px;
      cursor: pointer;
      color: var(--vscode-button-secondaryForeground);
      background: var(--vscode-button-secondaryBackground);
    }
    button.primary {
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
    }
    button:disabled { opacity: 0.6; cursor: default; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; vertical-align: top; padding: 8px 8px 8px 0; }
    th { font-size: 12px; color: var(--vscode-descriptionForeground); font-weight: 600; }
    .zh {
      white-space: pre-wrap;
      word-break: break-word;
      padding-top: 6px;
    }
    .badge {
      display: inline-block;
      margin-top: 4px;
      padding: 0 6px;
      border-radius: 8px;
      font-size: 11px;
      color: var(--vscode-badge-foreground);
      background: var(--vscode-badge-background);
    }
    .warn, .error, .ok {
      border-radius: 4px;
      padding: 8px 10px;
      margin: 0 0 12px;
      white-space: pre-wrap;
    }
    .warn { background: var(--vscode-inputValidation-warningBackground); color: var(--vscode-inputValidation-warningForeground, inherit); }
    .error { background: var(--vscode-inputValidation-errorBackground); }
    .ok { background: var(--vscode-diffEditor-insertedLineBackground, rgba(80, 160, 80, 0.2)); }
    .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
    .pick { width: 16px; }
  </style>
</head>
<body>
  <h1>提取 template 中文</h1>
  <p class="source muted" id="source"></p>
  <div id="warnings"></div>
  <div id="status"></div>
  <div class="field">
    <label for="moduleName">语言文件名</label>
    <input id="moduleName" type="text" spellcheck="false" />
    <div class="path muted" id="pathPreview"></div>
  </div>
  <label class="check">
    <input id="replace" type="checkbox" />
    <span>同时把 template 中的中文替换为 <code id="sample"></code>。可在编辑器里撤销。</span>
  </label>
  <div class="toolbar">
    <button id="translateEn" type="button">AI 翻译空英文</button>
    <button id="regen" type="button">重新生成键名</button>
    <button id="copyEn" type="button">把中文复制到 English</button>
  </div>
  <table>
    <thead>
      <tr>
        <th></th>
        <th>键名</th>
        <th>中文 cn.js</th>
        <th>English en.js</th>
      </tr>
    </thead>
    <tbody id="rows"></tbody>
  </table>
  <div class="actions">
    <button id="submit" class="primary" type="button" disabled>写入语言文件</button>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi()
    const sourceEl = document.getElementById('source')
    const warningsEl = document.getElementById('warnings')
    const statusEl = document.getElementById('status')
    const moduleInput = document.getElementById('moduleName')
    const pathPreview = document.getElementById('pathPreview')
    const replaceInput = document.getElementById('replace')
    const sampleEl = document.getElementById('sample')
    const rowsEl = document.getElementById('rows')
    const submitBtn = document.getElementById('submit')
    const translateBtn = document.getElementById('translateEn')
    let state = null

    function escapeHtml(value) {
      return value.replace(/[&<>"']/g, (char) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      })[char])
    }

    function renderPath() {
      if (!state) return
      const name = moduleInput.value.trim() || '…'
      pathPreview.textContent = state.langRootLabel + '/' + name + '/cn.js    ' + state.langRootLabel + '/' + name + '/en.js'
    }

    function renderSample() {
      if (!state) return
      const name = moduleInput.value.trim() || '模块'
      const first = rowsEl.querySelector('input.key')
      const key = (first && first.value.trim()) || 'brandName'
      sampleEl.textContent = '{{ ' + state.i18nFunction + "('" + name + '.' + key + "') }}"
    }

    function render() {
      sourceEl.textContent = state.fileLabel + '  ·  ' + state.entries.length + ' 条中文'
      moduleInput.value = state.defaultModule
      replaceInput.checked = state.replaceDefault
      warningsEl.innerHTML = state.warnings.length
        ? '<div class="warn">' + escapeHtml(state.warnings.join('\\n')) + '</div>'
        : ''
      rowsEl.innerHTML = state.entries.map((entry) => (
        '<tr data-id="' + escapeHtml(entry.id) + '">' +
          '<td><input class="pick" type="checkbox" checked /></td>' +
          '<td><input class="key" type="text" spellcheck="false" value="' + escapeHtml(entry.key) + '" />' +
            (entry.reused ? '<div class="badge">沿用已有键</div>' : '') + '</td>' +
          '<td><div class="zh"></div></td>' +
          '<td><textarea class="en"></textarea></td>' +
        '</tr>'
      )).join('')
      ;[...rowsEl.querySelectorAll('tr')].forEach((row, index) => {
        row.querySelector('.zh').textContent = state.entries[index].zh
        row.querySelector('.en').value = state.entries[index].en || ''
      })
      renderPath()
      renderSample()
      translateBtn.disabled = false
      submitBtn.disabled = false
      if (state.autoTranslate) {
        state.autoTranslate = false
        translateEmptyEnglish()
      } else {
        statusEl.innerHTML = ''
      }
    }

    moduleInput.addEventListener('input', () => { renderPath(); renderSample() })
    rowsEl.addEventListener('input', (event) => {
      if (event.target.classList.contains('key')) renderSample()
    })

    document.getElementById('regen').addEventListener('click', () => {
      if (!state) return
      vscode.postMessage({ type: 'regenerate', sessionId: state.sessionId, moduleName: moduleInput.value })
    })
    function translateEmptyEnglish() {
      if (!state) return
      const entries = [...rowsEl.querySelectorAll('tr')]
        .filter((row) => !row.querySelector('.en').value.trim())
        .map((row) => ({ id: row.dataset.id }))
      if (entries.length === 0) {
        statusEl.innerHTML = '<div class="ok">英文栏已经填写完成。</div>'
        return
      }
      translateBtn.disabled = true
      statusEl.innerHTML = '<div class="muted">正在请求语言模型翻译……</div>'
      vscode.postMessage({ type: 'translate', sessionId: state.sessionId, entries })
    }
    translateBtn.addEventListener('click', translateEmptyEnglish)
    document.getElementById('copyEn').addEventListener('click', () => {
      ;[...rowsEl.querySelectorAll('tr')].forEach((row) => {
        const en = row.querySelector('.en')
        if (!en.value.trim()) en.value = row.querySelector('.zh').textContent
      })
    })
    submitBtn.addEventListener('click', submit)
    document.addEventListener('keydown', (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') submit()
    })

    function submit() {
      if (!state) return
      const entries = [...rowsEl.querySelectorAll('tr')].filter((row) => row.querySelector('.pick').checked).map((row) => ({
        id: row.dataset.id,
        key: row.querySelector('.key').value.trim(),
        en: row.querySelector('.en').value
      }))
      submitBtn.disabled = true
      statusEl.innerHTML = ''
      vscode.postMessage({
        type: 'submit',
        sessionId: state.sessionId,
        moduleName: moduleInput.value,
        replace: replaceInput.checked,
        entries
      })
    }

    window.addEventListener('message', (event) => {
      const message = event.data
      if (message.type === 'init') {
        state = message
        render()
      }
      if (message.type === 'keys' && state && message.sessionId === state.sessionId) {
        const inputs = [...rowsEl.querySelectorAll('input.key')]
        message.keys.forEach((key, index) => {
          if (inputs[index]) inputs[index].value = key
        })
        renderSample()
      }
      if (message.type === 'error') {
        translateBtn.disabled = false
        submitBtn.disabled = false
        statusEl.innerHTML = '<div class="error">' + escapeHtml(message.message) + '</div>'
      }
      if (message.type === 'translations' && state && message.sessionId === state.sessionId) {
        const translated = new Map(message.entries.map((entry) => [entry.id, entry.en]))
        ;[...rowsEl.querySelectorAll('tr')].forEach((row) => {
          const en = row.querySelector('.en')
          const translation = translated.get(row.dataset.id)
          if (translation && !en.value.trim()) en.value = translation
        })
        translateBtn.disabled = false
        statusEl.innerHTML = '<div class="ok">英文翻译已回填，请检查后写入。</div>'
      }
      if (message.type === 'done') {
        submitBtn.disabled = false
        statusEl.innerHTML = '<div class="ok">' + escapeHtml(message.message) + '</div>'
      }
    })

    vscode.postMessage({ type: 'ready' })
  </script>
</body>
</html>`
}
