const sqlite = require('./sqlite')
const worker = require('./worker')
const fs = require('fs')
const path = require('path')

async function main () {
  const dataPath = path.resolve(__dirname, '../dist/data.sqlite')
  if (fs.existsSync(dataPath)) {
    fs.unlinkSync(dataPath)
  }
  await sqlite.init()
  await worker.fetchVillages()
  await worker.patch()

  console.log('[100%] 数据抓取完成！')
}

main().then(() => process.exit(0)).catch(e => {
  console.log(e)
  process.exit(-1)
})
