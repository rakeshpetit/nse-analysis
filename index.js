import { getURLs } from './getDates'
import { downloadAsync, unZipAsync } from './downloadAsync'
import { collateData } from './collateData'
import { analyseData } from './analyseData'
const startingDateStr = '01/09/2019'
const endingDateStr = '31/12/2019'

const urls = getURLs(startingDateStr, endingDateStr)
// console.log(urls)
// downloadAsync(urls)
// unZipAsync(urls)
// collateData(urls)
analyseData(startingDateStr, endingDateStr)