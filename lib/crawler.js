const http = require('http')

const iconv = require('iconv-lite')
const minify = require('html-minifier').minify
const BufferHelper = require('bufferhelper')

/*
 * 命名简写备注
 *
 * 省级（省份，Province）           p
 * 地级（城市，City）               c
 * 县级（区县，Area）               a
 * 乡级（乡镇街道，Street）         s
 * 村级（村委会居委会，Village）    v
 */

const pReg = /<td><a href='(.*?).html'>(.*?)<br><\/a><\/td>/g
const casReg = /<tr class='.*?'><td><a href=.*?>(.*?)<\/a><\/td><td><a href=.*?>(.*?)<\/a><\/td><\/tr>/g
const vReg = /<tr class='.*?'><td>(.*?)<\/td><td>(.*?)<\/td><td>(.*?)<\/td><\/tr>/g

const host = 'www.stats.gov.cn'
const path = '/tjsj/tjbz/tjyqhdmhcxhfdm/2018/#{route}.html'

const getParams = () => {
  const codeObj = {}
  if (process.argv.length > 2) {
    const params = process.argv.slice(2)
    for (let i = 0; i < params.length; i++) {
      const param = params[i].split('=')
      if (param[0] === 'code') {
        const code = param[1].toString().split(',')
        const pCode = []
        const cCode = []
        const aCode = []
        for (let i = 0; i < code.length; i++) {
          pCode.push(code[i].substr(0, 2))
          if (code[i].length === 6) {
            cCode.push(code[i].substr(0, 4))
            aCode.push(code[i].substr(0, 6))
          } else if (code[i].length === 4) {
            cCode.push(code[i].substr(0, 4))
          }
        }
        codeObj.pCode = pCode.length ? pCode : null
        codeObj.cCode = cCode.length ? cCode : null
        codeObj.aCode = aCode.length ? aCode : null
      }
    }
  }
  return codeObj
}

/**
 * 抓取数据
 * @author modood <https://github.com/modood>
 * @datetime 2018-01-31 19:23
 */
exports.fetch = (host, route, regexp, codeLen, pCode = null, cCode = null, aCode = null) =>
  new Promise((resolve, reject) => http.get({
    host,
    path: path.replace('#{route}', route),
    timeout: 3000
  }, res => {
    const bufferHelper = new BufferHelper()
    const statusCode = res.statusCode

    if (statusCode !== 200) {
      res.resume()
      return reject(new Error('Request Failed. Status Code: ' + statusCode))
    }

    res.on('data', chunk => bufferHelper.concat(chunk))

    res.on('end', () => {
      const rawData = minify(iconv.decode(bufferHelper.toBuffer(), 'GBK'), { collapseWhitespace: true, quoteCharacter: '\'' })

      const result = {}
      let current
      let villageCode = ''
      let streetCode = ''
      let isFirst = true
      let outCount = 0
      while ((current = regexp.exec(rawData)) !== null) {
        let flag = false
        if (pCode) {
          for (let i = 0; i < pCode.length; i++) {
            if (current[1].substr(0, codeLen) === pCode[i]) {
              flag = true
              break
            }
          }
          if (!flag) {
            continue
          }
        } else if (cCode) {
          for (let i = 0; i < cCode.length; i++) {
            if (current[1].substr(0, codeLen) === cCode[i]) {
              flag = true
              break
            }
          }
          if (!flag) {
            continue
          }
        } else if (aCode) {
          for (let i = 0; i < aCode.length; i++) {
            if (current[1].substr(0, codeLen) === aCode[i]) {
              flag = true
              break
            }
          }
          if (!flag) {
            continue
          }
        }
        if (current.length > 3) { // village
          if (current[1].substr(9, 3) === '498' || current[1].substr(9, 3) === '598') { // 虚拟单位
            continue
          } else if (current[1] === '150423101200' || current[1] === '150423101201' || // 塔西村和索博日嘎嘎查村城乡分类代码有误 反了
          current[1] === '150422105001' || current[1] === '150422105002' || current[1] === '150422105003' ||
          current[1] === '150426403401' || current[1] === '150426403402' || current[1] === '150426403403') {
            if (current[1] === '150423101200') {
              // eslint-disable-next-line no-useless-escape
              result[current[1].substr(0, codeLen)] = current[3].trim().replace(/居(.*?)委(.*?)会|建设管理委员会|管(.*?)委(.*?)会|办事处/, '').replace(/村(.*?)委(.*?)会/, '村').replace(/\(\)|\（\）|筹备处|委员会/, '')
            } else if (current[1] === '150423101201') {
              result['150423101201'] = '镇内'
            } else {
              continue
            }
          } else {
            if (parseInt(current[2].trim()) === 121) { // 镇中心 不再细分
              if (isFirst) {
                villageCode = current[1].substr(0, codeLen)
                isFirst = false
              }
              continue
            } else if (parseInt(current[2].trim()) < 120) { // 111表示：主城区 112表示：城乡结合区 不再细分
              continue
            }
            outCount++
            // eslint-disable-next-line no-useless-escape
            result[current[1].substr(0, codeLen)] = current[3].trim().replace(/居(.*?)委(.*?)会|建设管理委员会|管(.*?)委(.*?)会|办事处/, '').replace(/村(.*?)委(.*?)会/, '村').replace(/\(\)|\（\）|筹备处|委员会/, '')
          }
        } else {
          if (parseInt(current[1].substr(6, 3)) > 0 && parseInt(current[1].substr(6, 3)) < 100) { // 街道  不再细分
            if (isFirst) {
              streetCode = current[1].substr(0, codeLen)
              isFirst = false
            }
            continue
          }
          outCount++
          // eslint-disable-next-line no-useless-escape
          result[current[1].substr(0, codeLen)] = current[2].trim().replace(/居(.*?)委(.*?)会|村(.*?)委(.*?)会|建设管理委员会|管(.*?)委(.*?)会|办事处/, '').replace(/村(.*?)委(.*?)会/, '村').replace(/\(\)|\（\）|筹备处|委员会/, '')
        }
      }

      if (streetCode && outCount) {
        result[streetCode] = '城区'
      }
      if (villageCode && outCount) {
        result[villageCode] = '镇内'
      }
      return resolve(result)
    })
  }).on('error', reject).on('timeout', () => reject(new Error('timeout'))))

/**
 * 抓取省级数据
 * @author modood <https://github.com/modood>
 * @datetime 2018-01-31 19:40
 */
exports.fetchProvinces = async () => {
  try {
    const codeObj = getParams()
    return await exports.fetch(host, 'index', pReg, 2, codeObj.pCode)
  } catch (err) {
    if (err.message !== 'timeout') console.log(`抓取省级数据失败（${err}），正在重试...`)
    return exports.fetchProvinces()
  }
}

/**
 * 抓取地级数据
 * @author modood <https://github.com/modood>
 * @datetime 2018-01-31 19:51
 */
exports.fetchCities = async (pCode) => {
  try {
    const codeObj = getParams()
    return await exports.fetch(host, pCode, casReg, 4, null, codeObj.cCode, null)
  } catch (err) {
    if (err.message !== 'timeout') console.log(`抓取省级（${pCode}）的地级数据失败（${err}），正在重试...`)
    return exports.fetchCities(pCode)
  }
}

/**
 * 抓取县级数据
 * @author modood <https://github.com/modood>
 * @datetime 2018-01-31 20:03
 */
exports.fetchAreas = async (cCode) => {
  cCode = cCode.toString()
  const pCode = cCode.substr(0, 2)
  const codeObj = getParams()

  try {
    return await exports.fetch(host, `${pCode}/${cCode}`, casReg, 6, null, null, codeObj.aCode)
  } catch (err) {
    if (err.message !== 'timeout') console.log(`抓取地级（${cCode}）的县级数据失败（${err}），正在重试...`)
    return exports.fetchAreas(cCode)
  }
}

/**
 * 抓取乡级数据
 * @author modood <https://github.com/modood>
 * @datetime 2018-01-31 20:08
 */
exports.fetchStreets = async (aCode, route) => {
  aCode = aCode.toString()
  const pCode = aCode.substr(0, 2)
  const cCodeSuffix = aCode.substr(2, 2)
  const _route = route || `${pCode}/${cCodeSuffix}/${aCode}`

  try {
    return await exports.fetch(host, _route, casReg, 9)
  } catch (err) {
    if (err.message !== 'timeout') console.log(`抓取县级（${aCode}）的乡级数据失败（${err}），正在重试...`)
    return exports.fetchStreets(aCode, route)
  }
}

/**
 * 抓取村级数据
 * @author modood <https://github.com/modood>
 * @datetime 2018-01-31 20:19
 */
exports.fetchVillages = async (sCode, route) => {
  sCode = sCode.toString()
  const pCode = sCode.substr(0, 2)
  const cCodeSuffix = sCode.substr(2, 2)
  const aCodeSuffix = sCode.substr(4, 2)
  const _route = route || `${pCode}/${cCodeSuffix}/${aCodeSuffix}/${sCode}`

  try {
    return await exports.fetch(host, _route, vReg, 12)
  } catch (err) {
    if (err.message !== 'timeout') console.log(`抓取乡级（${sCode}）的村级数据失败（${err}），正在重试...`)
    return exports.fetchVillages(sCode, route)
  }
}
