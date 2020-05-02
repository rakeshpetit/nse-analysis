import { getURLs } from './getDates'
import { downloadAsync, unZipAsync } from './downloadAsync'
import { collateData } from './collateData'
import { analyseData, filterData } from './analyseData'
// import { writeToCsv } from './dataToCsv'
const startingDateStr = '01/01/2014'
const endingDateStr = '31/12/2014'

const urls = getURLs(startingDateStr, endingDateStr)
// console.log(urls)
downloadAsync(urls)
// unZipAsync(urls)
// collateData(urls)

// analyseData(startingDateStr, endingDateStr).then(data => {
//     filterData(data)
// })


// writeToCsv(startingDateStr, endingDateStr)