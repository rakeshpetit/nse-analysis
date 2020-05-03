import moment from 'moment'
import { getURLs } from './getDates'
import { downloadAsync, unZipAsync } from './downloadAsync'
import { collateData } from './collateData'
import { calculateMarks, analyseData, filterData } from './analyseData'
// import { writeToCsv } from './dataToCsv'
const startingDateStr = '01/01/2016'
const endingDateStr = '31/12/2016'

const urls = getURLs(startingDateStr, endingDateStr)
// console.log(urls)
// downloadAsync(urls)
// unZipAsync(urls)
// collateData(urls)

const dateStr = '01/01/2019'

calculateMarks(dateStr)




// writeToCsv(startingDateStr, endingDateStr)