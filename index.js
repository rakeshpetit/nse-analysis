import { getURLs } from './getDates'
import { downloadAsync } from './downloadAsync'
const startingDateStr = '01/01/2019'
const endingDateStr = '31/12/2019'

const urls = getURLs(startingDateStr, endingDateStr)
console.log(urls)
downloadAsync(urls)

