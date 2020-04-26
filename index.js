import { getURLs } from './getDates'
import { downloadAsync } from './downloadAsync'
import { unZip } from './unzipFile'
const startingDateStr = '01/01/2019'
const endingDateStr = '01/01/2019'

const urls = getURLs(startingDateStr, endingDateStr)
console.log(urls)
downloadAsync(urls)
unZip(urls)