const fraudList = {
    'ADANIENT': true,
    'ADANIPORTS': true,
    'ADANITRANS': true,
    'ABAN': true,
    'ABGSHIP': true,
    'ALBK': true,
    'BALMLAWRIE': true,
    'BANKBARODA': true,
    'BANKINDIA': true,
    'BHEL': true,
    'BPCL': true,
    'CANBK': true,
    'COALINDIA': true,
    'COCHINSHIP': true,
    'CONCOR': true,
    'CORPBANK': true,
    'DLF': true,
    'GAIL': true,
    'HINDCOPPER': true,
    'HINDPETRO': true,
    'INDIANB': true,
    'IOC': true,
    'MOIL': true,
    'NMDC': true,
    'NTPC': true,
    'OIL': true,
    'ONGC': true,
    'ORIENTBANK': true,
    'ORISSAMINE': true,
    'PFC': true,
    'PNB': true,
    'POWERGRID': true,
    'RCOM': true,
    'RECLTD': true,
    'RELCAPITAL': true,
    'RELINFRA': true,
    'SBIN': true,
    'SBT': true,
    'SYNDIBANK': true,
    'UNIONBANK': true,
}

const noDataList = {
    '2010': {

    },
    '2011': {
        'INFOSYSTCH': true,
        'COREPROTEC': true,
        'ESCORTS': true,
        'HEROHONDA': true,
        'RELMEDIA': true,
        'ATLASCYCLE': true,
        'RUCHISOYA': true,
        'PTC': true,
        'BAJAUTOFIN': true,
        'PARSVNATH': true,
        'KTKBANK': true,
        'WOCKPHARMA': true,
        'ADANIPOWER': true,
        'KWALITY': true,
        'SURYAPHARM': true,
        'ATLANTA': true,
    },
    '2012': {

    },
    '2013': {

    },
    '2014': {

    },
    '2015': {
        'SHREECEM': true,
        'GRANULES': true,
        'GUJRATGAS': true,
        'RANBAXY': true,
        'PAGEIND': true,
        'AHMEDFORGE': true,
        'INGVYSYABK': true,
    },
    '2016': {

    },
    '2017': {
        'FRETAIL': true,
        'GOACARBON': true,
        'CAIRN': true,
        'UPERGANGES': true,
    },
    '2018': {

    },
    '2019': {
        'ABBOTINDIA': true,
        'MERCK': true,
        // 'UPERGANGES': true,
        // 'DWARKESH': true,
        // 'CAIRN': true,
        // 'NRBBEARING': true,
        'INFIBEAM': true
    },
    '2020': {

    }
}

const exceptionList = {
    ...fraudList,
    ...noDataList,
    'N100': true,
    'NIFTYBEES': true,
    'NET4': true,
    'IIFLNIFTY': true,
    'SBIGETS': true,
    'IPGETF': true,
    'AXISGOLD': true,
    'RELGOLD': true,
    'SETFNIFBK': true,
    'KOTAKBKETF': true,
    'UTINIFTETF': true,
    'BSLGOLDETF': true,
    'JUNIORBEES': true,
    'BANKBEES': true,
    'SETFGOLD': true,
    'HDFCMFGETF': true,
    'KOTAKGOLD': true,
    'GOLDSHARE': true,
    'GOLDBEES': true,
    'KOTAKNIFTY': true,
    'SETFNIF50': true,
    'QGOLDHALF': true,
    'ICICINIFTY': true,
    'EBBETF0423': true,
    'EBBETF0430': true,
    'IDBIGOLD': true,
    'LIQUIDBEES': true,
}

export { noDataList, exceptionList }
