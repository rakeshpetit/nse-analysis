import { getURLs } from './getDates'
import { downloadAsync, unZipAsync } from './downloadAsync'
const startingDateStr = '01/01/2018'
const endingDateStr = '31/12/2018'

const urls = getURLs(startingDateStr, endingDateStr)
console.log(urls)
downloadAsync(urls)
unZipAsync(urls)