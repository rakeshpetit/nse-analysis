import fs from 'fs';
import moment from 'moment';
import { createStore } from 'redux'
import { getURLs } from './getDates'
import { downloadAsync, unZipAsync } from './downloadAsync'
import { collateData } from './collateData'
import { counter } from './reducers'
import { findReturns } from './analyseData'
import { getCleanData, calculateForYear } from './analyseDataNew'
import { fetchListJSONdata } from './analyseReturns'
import { writeToCsv } from './dataToCsv'
const startingDateStr = '01/01/2019'
const endingDateStr = '31/12/2019'

const urls = getURLs(startingDateStr, endingDateStr)
// downloadAsync(urls)
// unZipAsync(urls)
// collateData(urls)
// writeToCsv(startingDateStr, endingDateStr)

export const store = createStore(counter)

// calculateForYear(2019).then(() => {
//     const selectedList = store.getState()['selectedList']
//     fs.writeFile(`list.json`, JSON.stringify(selectedList), 'utf8', () => { });
// })

fetchListJSONdata().then((listData) => {
    store.dispatch({
        type: 'RETRIEVE_SELECTED_LIST',
        data: listData
    })
    return Promise.resolve()
})
.then(() => getCleanData('01/01/2019'))
.then(() => {
    const originalList = store.getState()['selectedList']
    const listData = originalList
    // const listData = Object.keys(originalList).reduce((acc, month) => {
    //     const listItems = originalList[month].filter(item => item.position < 26)
    //     return {
    //         ...acc,
    //         [month]: listItems
    //     }
    // }, {})
    const pricesArray = store.getState()['cleanCurrentYearPrice']
    Object.keys(listData)
        .map((month, index, listArray) => {
        console.log('curr', month)
            const dateMoment = moment(month, 'DD/MM/YYYY')
            const nextMonthMoment = dateMoment.clone().add(1, "month")
            listData[month].map(item => {
                const returns = findReturns(
                    pricesArray, item.ticker, dateMoment, nextMonthMoment
                    )
                console.log(item.position, item.ticker, returns)
            })
    })
})

