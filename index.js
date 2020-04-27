import { getURLs } from './getDates'
import { downloadAsync, unZipAsync } from './downloadAsync'
import { collateData } from './collateData'
import { writeToCsv } from './dataToCsv'
import { cleanData } from './cleanData'
const startingDateStr = '01/01/2019'
const endingDateStr = '31/12/2019'

const urls = getURLs(startingDateStr, endingDateStr)
// console.log(urls)
// downloadAsync(urls)
// unZipAsync(urls)
// collateData(urls)
cleanData(startingDateStr, endingDateStr, (cleanedData) => {
    console.log(cleanedData)
})


// writeToCsv(startingDateStr, endingDateStr)