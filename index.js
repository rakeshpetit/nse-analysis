import moment from 'moment'
import { getURLs } from './getDates'
import { downloadAsync, unZipAsync } from './downloadAsync'
import { collateData } from './collateData'
import { calculateMarks, analyseData, filterData } from './analyseData'
// import { writeToCsv } from './dataToCsv'
const startingDateStr = '01/01/2020'
const endingDateStr = '30/04/2020'

// const urls = getURLs(startingDateStr, endingDateStr)
// console.log(urls)
// downloadAsync(urls)
// unZipAsync(urls)
// collateData(urls)
// writeToCsv(startingDateStr, endingDateStr)
let year = 2017
let yearlyCalc = []
    for (let month = 0; month < 12; month++) {
        const iStr = `01/${month + 1}/${year}`
        console.log(iStr)
        yearlyCalc.push(calculateMarks(iStr))
    }

Promise.all(yearlyCalc).then((data) => {
    const cagr = data.reduce((retcagr, totalRet) => {
        const periodCagr = retcagr *  ((100 + totalRet)/100)
        console.log('CAGR for the period', periodCagr)
        return periodCagr
    }, 100)
    console.log('\n\nCAGR for the year', cagr)
})
const dateStr = '01/01/2019'

