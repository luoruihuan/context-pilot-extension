export function articlePage(): string {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>Article fixture</title><meta name="description" content="Context Pilot 静态文章测试页"></head><body><main><article><h1>潮汐能项目进展</h1><p>北港试验站在本季度完成了三台潮汐涡轮机部署，预计每年提供 4.8 吉瓦时清洁电力。</p><p>团队同时将维护窗口缩短到六小时，并把海洋生物监测数据纳入每周报告。</p><h2>下一阶段</h2><p>项目将在十月比较新叶片与上一代叶片的效率。</p></article></main></body></html>`;
}

export function spaPage(): string {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>SPA fixture</title></head><body><main><h1>区域能源看板</h1><p id="content">初始数据：发电量 2.1 吉瓦时。</p><button id="load">加载新内容</button></main><script>document.querySelector('#load').addEventListener('click',()=>{history.pushState({},'', '/spa?period=latest');document.querySelector('#content').textContent='最新数据：发电量 4.8 吉瓦时，维护窗口六小时。';});</script></body></html>`;
}

export function tablePage(): string {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>Table fixture</title></head><body><main><h1>项目对比</h1><table><thead><tr><th>项目</th><th>发电量</th><th>维护窗口</th></tr></thead><tbody><tr><td>北港</td><td>4.8 GWh</td><td>6 小时</td></tr><tr><td>南湾</td><td>3.2 GWh</td><td>9 小时</td></tr></tbody></table></main></body></html>`;
}
