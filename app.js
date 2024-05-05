const express = require('express')
const sqlite3 = require('sqlite3')
const {open} = require('sqlite')
const path = require('path')
const dbPath = path.join(__dirname, 'covid19IndiaPortal.db')

const app = express()
app.use(express.json())

const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
let db = null

const initDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () =>
      console.log('The server is running at http://localhost:3000/'),
    )
  } catch (err) {
    console.log(`Db error: ${err.message}`)
    process.exit(1)
  }
}
initDbAndServer()

const convertStateToResp = dbObj => {
  return {
    stateId: dbObj.state_id,
    stateName: dbObj.state_name,
    population: dbObj.population,
  }
}
const convertDistrictToResp = dbObj => {
  return {
    districtId: dbObj.district_id,
    districtName: dbObj.district_name,
    stateId: dbObj.state_id,
    cases: dbObj.cases,
    cured: dbObj.cured,
    active: dbObj.active,
    deaths: dbObj.deaths,
  }
}

function authenticateToken(request, response, next) {
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

app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const selectedUser = `SELECT * FROM user WHERE username=${username};`
  const dbUser = await db.get(selectedUser)
  if (dbUser === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const isMatching = await bcrypt.compare(password, dbUser.password)
    if (isMatching === true) {
      const payload = {username: username}
      const jwtToken = jwt.sign(payload, 'MY_SECRET_TOKEN')
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})
app.get('/states/', authenticateToken, async (request, response) => {
  const getStates = `SELECT * FROM state;`
  const states = await db.all(getStates)
  response.send(states.map(each => convertStateToResp(each)))
})
app.get('/states/:stateId/', authenticateToken, async (request, response) => {
  const {stateId} = request.params
  const getState = `SELECT * FROM state WHERE state_id=${stateId};`
  const state = await db.get(getState)
  response.send(convertStateToResp(state))
})
app.post('/districts/', authenticateToken, async (request, response) => {
  const {districtName, stateId, cases, cured, active, deaths} = request.body
  const postDistrict = `INSERT INTO district (state_id, district_name, cases, cured, active, deaths)
    VALUES (${stateId},'${districtName}', ${cases},${cured},${active},${deaths});`
  await db.run(postDistrict)
  response.send('District Successfully Added')
})
app.get(
  '/districts/:districtId/',
  authenticateToken,
  async (request, response) => {
    const {districtId} = request.params
    const getDistrict = `SELECT * FROM district WHERE district_id=${districtId};`
    const district = await db.get(getDistrict)
    response.send(convertDistrictToResp(district))
  },
)
app.delete(
  '/districts/:districtId/',
  authenticateToken,
  async (request, response) => {
    const {districtId} = request.params
    const deleteDistrict = `DELETE FROM district WHERE district_id=${districtId};`
    await db.run(deleteDistrict)
    response.send('District Removed')
  },
)
app.put(
  '/districts/:districtId/',
  authenticateToken,
  async (request, response) => {
    const {districtId} = request.params
    const {districtName, stateId, cases, cured, active, deaths} = request.body
    const updateDistrict = `UPDATE district SET district_name=${districtName},
    state_id=${stateId},cases=${cases},cured=${cured},active=${active},deaths=${deaths}
    WHERE district_id=${districtId};`
    await db.run(updateDistrict)
    response.send('District Details Updated')
  },
)
app.get(
  '/states/:stateId/stats/',
  authenticateToken,
  async (request, response) => {
    const {stateId} = request.params
    const getStats = `SELECT SUM(cases),SUM(cured),SUM(active),SUM(deaths) FROM
    district WHERE state_id=${stateId};`
    const stats = await db.get(getStats)
    response.send({
      totalCases: stats['SUM(cases)'],
      totalCured: stats['SUM(cured)'],
      totalActive: stats['SUM(active)'],
      totalDeaths: stats['SUM(deaths)'],
    })
  },
)
module.exports = app
