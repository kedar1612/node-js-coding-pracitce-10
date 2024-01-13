const express = require('express')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const path = require('path')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const databasePath = path.join(__dirname, 'covid19IndiaPortal.db')
const app = express()
app.use(express.json())

let database = null

const initializeDb = async () => {
  try {
    database = await open({
      filename: databasePath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => console.log('Server is Running'))
  } catch (e) {
    console.log(`DB Error: ${e.message}`)
    process.exit(1)
  }
}
initializeDb()

const convertDistrictObject = dbObject => {
  return {
    stateId: dbObject.state_id,
    stateName: dbObject.state_name,
    population: dbObject.population,
    districtId: dbObject.district_id,
    districtName: dbObject.district_name,
    stateId: dbObject.state_id,
    cases: dbObject.cases,
    cured: dbObject.cured,
    active: dbObject.active,
    deaths: dbObject.deaths,
  }
}
// user authenication
function authenicationToken(request, response, next) {
  let jwtToken
  const authHeader = request.headers['authorization']
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1]
  }
  if (jwtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'MY_SECRET_TOKEN', async (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        next()
      }
    })
  }
}

// return user login
app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const selectUserQuery = `SELECT * FROM user WHERE username ='${username}';`
  const dbUser = await database.get(selectUserQuery)
  if (dbUser === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const isPasswordMatch = await bcrypt.compare(password, dbUser.password)
    if (isPasswordMatch === true) {
      const payload = {
        username: username,
      }
      const jwtToken = jwt.sign(payload, 'MY_SECRET_TOKEN')
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})
// returns all state
app.get('/states/', authenicationToken, async (request, response) => {
  getStateQuery = `
    SELECT *
    FROM 
      state
    ORDER BY state_id;`

  const stateArray = await database.all(getStateQuery)
  response.send(stateArray.map(eachState => convertDistrictObject(eachState)))
})
//retruns specifc state
app.get('/states/:stateId', authenicationToken, async (request, response) => {
  const {stateId} = request.params
  const getStateQuery = `
      SELECT * 
      FROM 
        state
      WHERE  
        state_id = ${stateId}; `
  const state = await database.get(getStateQuery)
  response.send(convertDistrictObject(state))
})

// added to districts

app.post('/districts/', authenicationToken, async (request, response) => {
  const {districtName, stateId, cases, cured, active, deaths} = request.body
  const postDistrictQuery = `
  INSERT INTO
    district(district_name,state_id,cases,cured,active,deaths) 
  VALUES
  ('${districtName}','${stateId}','${cases}','${cured}','${active}','${deaths}');`
  const newDistrict = await database.run(postDistrictQuery)
  const myDistric = newDistrict.lastID
  response.send('District Successfully Added')
})
// get all the districts
app.get(
  '/districts/:districtId',
  authenicationToken,
  async (request, response) => {
    const {districtId} = request.params
    const getDistrictQuery = `
    SELECT 
        *
    FROM 
        district
    WHERE
        district_id = ${districtId}; `
    const district = await database.get(getDistrictQuery)
    response.send(convertDistrictObject(district))
  },
)

// delete the district
app.delete(
  '/districts/:districtId',
  authenicationToken,
  async (request, response) => {
    const {districtId} = request.params
    const deleteDistrictQuery = `
      DELETE 
      FROM
        district
      WHERE
        district_id = ${districtId};`
    await database.run(deleteDistrictQuery)
    response.send('District Removed')
  },
)
// update district with districtID
app.put(
  '/districts/:districtId',
  authenicationToken,
  async (request, response) => {
    const {districtId} = request.params
    const {districtName, stateId, cases, cured, active, deaths} = request.body

    const getUpdateDistrict = `
    UPDATE
      district
    SET 
      district_name = '${districtName}',
      state_id = ${stateId},
      cases = ${cases},
      cured = ${cured},
      active = ${active},
      deaths = ${deaths}
    WHERE
      district_id = ${districtId};
  `
    await database.run(getUpdateDistrict)
    response.send('District Details Updated')
  },
)
app.get(
  '/states/:stateId/stats',
  authenicationToken,
  async (request, response) => {
    const {stateId} = request.params
    const getDistrictStateQuery = `
    SELECT 
      SUM(cases) as totalCases,
      SUM(cured) as totalCured,
      SUM(active) as totalActive,
      SUM(deaths) as totalDeaths
    FROM
      district
    WHERE
      state_id = ${stateId};`
    const stateArray = await database.get(getDistrictStateQuery)
    response.send(stateArray)
  },
)

//Returns an object containing the state name of a district based on the district
app.get(
  '/districts/:districtId/details',
  authenicationToken,
  async (request, response) => {
    const {districtId} = request.params
    const getDistrictIdQuery = `
    SELECT
        state_id 
    FROM 
      district
    WHERE district_id = ${districtId};
  `
    const getDistrictResponseQuery = await database.get(getDistrictIdQuery)

    const stateNameQuery = `
    SELECT 
      state_name as stateName 
    FROM 
      state
    WHERE
      state_id = ${getDistrictResponseQuery.state_id};
  `
    const getStateNameResponse = await database.get(stateNameQuery)
    response.send(getStateNameResponse)
  },
)
module.exports = app
