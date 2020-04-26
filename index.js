import { getURLs } from './getDates'
import { downloadAsync } from './downloadAsync'
const startingDateStr = '01/01/2020'
const endingDateStr = '05/01/2020'

const urls = getURLs(startingDateStr, endingDateStr)
console.log(urls)
downloadAsync(urls)

