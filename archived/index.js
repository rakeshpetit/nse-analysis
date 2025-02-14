import moment from "moment";
import async from "async";
import { getURLs } from "./getDates";
import { downloadAsync, unZipAsync } from "./downloadAsync";
import { collateData } from "./collateData";
import { calculateMarks, analyseData, filterData } from "./analyseData";
// import { writeToCsv } from './dataToCsv'
const startingDateStr = "01/01/2020";
const endingDateStr = "28/06/2020";

const urls = getURLs(startingDateStr, endingDateStr);
// downloadAsync(urls)
// unZipAsync(urls)
// collateData(urls)
// writeToCsv(startingDateStr, endingDateStr)

const calculateMarksPromise = (iStr, month) => {
  return new Promise((resolve, reject) => {
    setTimeout(
      () => {
        // console.log('setTimeout', iStr)
        resolve(calculateMarks(iStr));
      },
      month < 8 ? 0 : month * 5000
    );
  });
};

const calculateForYear = (year) => {
  let yearlyCalc = [];
  for (let month = 0; month < 5; month++) {
    const iStr = `01/${month + 1}/${year}`;
    // console.log(iStr)
    yearlyCalc.push(calculateMarksPromise(iStr, month));
  }
  return Promise.all(yearlyCalc).then((data) => {
    let cagrLarge = 100;
    let cagrMid = 100;
    let cagrSmall = 100;
    const cagr = data.reduce((retcagr, totalRet) => {
      const periodCagr = retcagr * ((100 + totalRet.totalReturns) / 100);
      // console.log('\nCAGR for the period', periodCagr)

      const periodCagrLarge =
        retcagr * ((100 + totalRet.totalReturnsLarge) / 100);
      // console.log('large CAGR for the period', periodCagrLarge)
      cagrLarge = periodCagrLarge;

      const periodCagrMid = retcagr * ((100 + totalRet.totalReturnsMid) / 100);
      // console.log('mid CAGR for the period', periodCagrMid)
      cagrMid = periodCagrMid;

      const periodCagrSmall =
        retcagr * ((100 + totalRet.totalReturnsSmall) / 100);
      // console.log('small CAGR for the period', periodCagrSmall)
      cagrSmall = periodCagrSmall;

      return periodCagr;
    }, 100);
    console.log(`\nCAGR for the year ${year}`, cagr);
    // console.log(`\nlarge CAGR for the year ${i}`, cagrLarge)
    // console.log('\nmid CAGR for the year', cagrMid)
    // console.log('\nsmall CAGR for the year', cagrSmall)
  });
};

// Promise.all([calculateForYear(2018), calculateForYear(2019)]).then(() => {
//     console.log('All done')
// })

// Promise.all([calculateForYear(2012), calculateForYear(2013)])
//     .then(() => Promise.all([calculateForYear(2014), calculateForYear(2015)]))
//     .then(() => Promise.all([calculateForYear(2016), calculateForYear(2017)]))
//     .then(() => Promise.all([calculateForYear(2018), calculateForYear(2019)]))

calculateForYear(2020);
