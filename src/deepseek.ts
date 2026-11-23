import https from 'https'

const MODEL = 'deepseek-chat'

interface DeepSeekResponse {
  choices?: Array<{ message?: { content?: string } }>
  error?: { message?: string }
}

export async function translateWithDeepSeek(text: string, apiKey: string): Promise<string> {
  const response = await postJson(apiKey, {
    model: MODEL,
    temperature: 0.2,
    messages: [
      {
        role: 'system',
        content: 'Translate Chinese UI text into concise, natural English. Preserve placeholders and formatting. Return only the translation, with no quotes or explanation.',
      },
      { role: 'user', content: text },
    ],
  })

  return parseDeepSeekResponse(response)
}

export function parseDeepSeekResponse(response: string): string {
  let result: DeepSeekResponse
  try {
    result = JSON.parse(response) as DeepSeekResponse
  } catch {
    throw new Error('DeepSeek 返回了无法解析的响应。')
  }
  const translation = result.choices?.[0]?.message?.content?.trim()
  if (!translation) {
    const detail = result.error?.message
    throw new Error(detail ? `DeepSeek 翻译失败：${detail}` : 'DeepSeek 没有返回英文结果。')
  }
  return translation.replace(/^["']|["']$/g, '')
}

function postJson(apiKey: string, payload: object): Promise<string> {
  const body = JSON.stringify(payload)
  return new Promise((resolve, reject) => {
    const request = https.request(
      'https://api.deepseek.com/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (response) => {
        let data = ''
        response.setEncoding('utf8')
        response.on('data', (chunk: string) => { data += chunk })
        response.on('end', () => {
          const status = response.statusCode ?? 0
          if (status < 200 || status >= 300) {
            try {
              const result = JSON.parse(data) as DeepSeekResponse
              reject(new Error(result.error?.message || `DeepSeek 请求失败（HTTP ${status}）。`))
            } catch (error) {
              reject(error instanceof Error ? error : new Error(`DeepSeek 请求失败（HTTP ${status}）。`))
            }
          } else {
            resolve(data)
          }
        })
      },
    )
    request.setTimeout(30000, () => request.destroy(new Error('DeepSeek 请求超时。')))
    request.on('error', reject)
    request.end(body)
  })
}
