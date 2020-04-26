import fs from 'fs'

const analyseData =() => {
    fs.readFile('data.json', 'utf8', function readFileCallback(err, data) {
        if (err) {
            console.log(err);
        } else {
            const obj = JSON.parse(data); //now it an object
            console.log(obj)
            // console.log(obj)
        }
    });
}


export { analyseData }