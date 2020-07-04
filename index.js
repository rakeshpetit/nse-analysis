import fs from 'fs';
import moment from 'moment';
import { createStore } from 'redux'
import { getURLs } from './getDates'
import { downloadAsync, unZipAsync } from './downloadAsync'
import { noDataList } from './config'
import { collateData } from './collateData'
import { counter } from './reducers'
import { findReturns } from './analyseData'
import { getCleanData, calculateForYear } from './analyseDataNew'
import { fetchListJSONdata } from './analyseReturns'
import { writeToCsv } from './dataToCsv'
const startingDateStr = '01/01/2010'
const endingDateStr = '31/12/2010'

// const urls = getURLs(startingDateStr, endingDateStr)
// downloadAsync(urls)
// unZipAsync(urls)
// collateData(urls)
// writeToCsv(startingDateStr, endingDateStr)

export const store = createStore(counter)

const year = '2019'

// calculateForYear(year).then(() => {
//     const selectedList = store.getState()['selectedList']
//     fs.writeFile(`list${year}.json`, JSON.stringify(selectedList), 'utf8', () => { });
// })



fetchListJSONdata(year).then((listData) => {
    store.dispatch({
        type: 'RETRIEVE_SELECTED_LIST',
        data: listData
    })
    return Promise.resolve()
})
    .then(() => getCleanData(`01/01/${year}`))
    .then(() => {
        const originalList = store.getState()['selectedList']
        let previousMonthListObj = {}
        const totalAllowed = 25
        const eliminationRank = 50
        const listData = Object.keys(originalList).reduce((acc, month, index) => {
            const currentMonthList = originalList[month]
            const currentMonthListObj = {}
            let numberOfCurrentMonthItems = 0
            console.log('\nmonth', month)
            let consolidatedList = currentMonthList.reduce((result, item) => {
                if (previousMonthListObj[item.ticker]
                    && !noDataList[year][item.ticker]
                    && item.analysis.averageValue >= 99999999
                    && item.position <= eliminationRank
                    && numberOfCurrentMonthItems < totalAllowed) {
                    currentMonthListObj[item.ticker] = true
                    numberOfCurrentMonthItems++
                    console.log(`${numberOfCurrentMonthItems} ${item.ticker} current rank ${item.position}`)
                    result.push(item)
                }
                return result
            }, [])

            currentMonthList.map(item => {
                if (!previousMonthListObj[item.ticker]
                    && !noDataList[year][item.ticker]
                    && item.analysis.averageValue >= 99999999
                    && (item.position <= totalAllowed
                        || numberOfCurrentMonthItems < totalAllowed)
                    && numberOfCurrentMonthItems < totalAllowed) {
                    currentMonthListObj[item.ticker] = true
                    numberOfCurrentMonthItems++
                    console.log(`${numberOfCurrentMonthItems} ${item.ticker} new`)
                    consolidatedList.push(item)
                }
            })
            previousMonthListObj = currentMonthListObj
            return {
                ...acc,
                [month]: consolidatedList
            }
        }, {})
        const pricesArray = store.getState()['cleanCurrentYearPrice']
        let yearly = 100
        Object.keys(listData)
            .map((month, index, listArray) => {
                console.log('\ncurr', month)
                const dateMoment = moment(month, 'DD/MM/YYYY')
                const nextMonthMoment = dateMoment.clone().add(1, "month")
                let totalReturns = 0
                const scripListSize = listData[month].length
                listData[month].map(item => {
                    
                    if (item) {
                        let returns = findReturns(
                            pricesArray, item.ticker, dateMoment, nextMonthMoment
                        )
                        returns = returns < -25 ? -25 : returns
                        totalReturns = returns + totalReturns
                        console.log(item.position, item.ticker, returns)
                    }
                })
                yearly = yearly * (1 + totalReturns / (scripListSize*100))
                console.log(`${month} => ${totalReturns / scripListSize}`)
            })
        console.log('yearly', yearly)
    })

