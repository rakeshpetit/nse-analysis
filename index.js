import { getURLs } from './getDates'
import { downloadAsync, unZipAsync } from './downloadAsync'
import { collateData } from './collateData'
import { analyseData } from './analyseData'
import { writeToCsv } from './dataToCsv'
const startingDateStr = '01/01/2019'
const endingDateStr = '31/12/2019'

const urls = getURLs(startingDateStr, endingDateStr)
// console.log(urls)
// downloadAsync(urls)
// unZipAsync(urls)
// collateData(urls)

analyseData(startingDateStr, endingDateStr).then(data => {
    console.log(data)
})


// writeToCsv(startingDateStr, endingDateStr)