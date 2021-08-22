const call = require("./dynamodb");
const pool = require("./config");

const insertUsers = async () => {
  try {
    const params = {
      TableName: "main-site-prod-users",
      // KeyConditionExpression: "simulation_status = :simulation_status",
      // IndexName: "simulation_status-index",
      // FilterExpression: "simulation_status = :simulation_status",
      // ExpressionAttributeValues: {
      //   ":simulation_status": "finished",
      // },
      ProjectionExpression: "cognitoIdentityId, email",
    };

    let response = await call("scan", params);
    let users = response.Items;
    while (response.LastEvaluatedKey) {
      params.ExclusiveStartKey = response.LastEvaluatedKey;
      response = await call("scan", params);
      if (response.Items.length > 0) {
        users = [...users, ...response.Items];
      }
    }

    const insertedUsersColumns = `insert into users(email, user_uuid) values `;
    users.forEach(async (user) => {
      const cognitoId = user.cognitoIdentityId.replace("us-east-1:", "");
      const values = `('${user.email}' ,'${cognitoId}')`;
      await pool.query(`${insertedUsersColumns}${values}`);
    });
  } catch (err) {
    console.log(err);
  }
};

// insertUsers();

const insertSimulations = async () => {
  try {
    const params = {
      TableName: "main-site-prod-simulations",
      // KeyConditionExpression: "simulation_status = :simulation_status",
      // IndexName: "simulation_status-index",
      FilterExpression: "simulation_status = :simulation_status",
      ExpressionAttributeValues: {
        ":simulation_status": "finished",
      },
    };

    let response = await call("scan", params);
    let simulations = response.Items;
    while (response.LastEvaluatedKey) {
      params.ExclusiveStartKey = response.LastEvaluatedKey;
      response = await call("scan", params);
      if (response.Items.length > 0) {
        simulations = [...simulations, ...response.Items];
      }
    }

    const { rows: users } = await pool.query(
      "select user_id, user_uuid from users"
    );

    const columns = `insert into simulations(simulation_uuid, user_id, type_id, final_score, validation_mistakes,
        total_time, num_of_clicks, updated_at, simulation_status, all_steps_completed, lang, session_started_time, session_completed_time ) values `;
    const simulations_sql = [];
    simulations.forEach(async (currentSim, index) => {
      const { user_id } =
        users.find(
          (user) =>
            user.user_uuid === currentSim.userId.replace("us-east-1:", "")
        ) || {};
      if (!user_id) return;

      let validationMistakes = 0;
      if (currentSim.final_score.validation_mistakes) {
        validationMistakes = currentSim.final_score.validation_mistakes;
      } else if (
        currentSim.final_score.Monitoring &&
        currentSim.final_score.Monitoring.validation_mistakes
      ) {
        validationMistakes =
          currentSim.final_score.Monitoring.validation_mistakes;
      }

      const lang =
        currentSim.lang ||
        (currentSim.meta_data && currentSim.meta_data.lang) ||
        "he";
      const query = `${columns}('${currentSim.sessionId}', ${user_id}, ${
        currentSim.typeId
      }, ${0}, ${validationMistakes}, '${
        currentSim.final_score.total_time || 0
      }',
            ${currentSim.final_score.sum_number_of_clicks || 0}, '${
        currentSim.update_time
      }', 
            '${currentSim.simulation_status}', ${
        currentSim.all_steps_completed
      }, '${lang}', '${currentSim.sessionStarted}', 
            '${currentSim.sessionCompleted}')`;
      const sim = await pool.query(query);
    });

  } catch (err) {
    console.log(err);
  }
};

// insertSimulations();

const insertCoreTasksSummary = async () => {
  try {
    const params = {
      TableName: "main-site-prod-simulations",
      // KeyConditionExpression: "simulation_status = :simulation_status",
      // IndexName: "simulation_status-index",
      FilterExpression: "simulation_status = :simulation_status",
      ExpressionAttributeValues: {
        ":simulation_status": "finished",
      },
      ProjectionExpression:
        "sessionId, core_tasks_scores, final_score, sessionStarted, sessionCompleted",
    };

    let response = await call("scan", params);
    let simulations = response.Items;
    while (response.LastEvaluatedKey) {
      params.ExclusiveStartKey = response.LastEvaluatedKey;
      response = await call("scan", params);
      if (response.Items.length > 0) {
        simulations = [...simulations, ...response.Items];
      }
    }

    const columns = `insert into core_tasks_summary(simulation_id, core_task_id, start_time, end_time, total_time, validation_false, 
        number_of_sub_tasks, sub_tasks_not_completed, score, clicks) values `;
    const arr = [];

    const { rows: coreTasks } = await pool.query(
      "select core_task_name,core_task_id  from core_tasks"
    );
    const { rows: simulationIds } = await pool.query(
      "select simulation_id, simulation_uuid from simulations"
    );

    simulations.forEach(async (currentSim) => {
      const simulation = simulationIds.find(
        (sim) => sim.simulation_uuid === currentSim.sessionId
      );
      if (!simulation) return;

      const simulationId = simulation.simulation_id;
      const valuesArr = [];
      Object.entries(currentSim.final_score).forEach(
        ([coreTaskName, coreTaskValue]) => {
          const coreTask = coreTasks.find(
            ({ core_task_name }) => core_task_name === coreTaskName
          );
          if (!coreTask) return;

          const coreTaskId = coreTask.core_task_id;
          const validationFalse = (currentSim.core_tasks_scores[coreTaskName] && 
            currentSim.core_tasks_scores[coreTaskName]["Validation - false"]) ||
            0;
          const totalTime = coreTaskValue.total_time || 0;
          const score = coreTaskValue.score || 0;
          const clicks = coreTaskValue.sum_number_of_clicks || 0;
          const subTasks = coreTaskValue.number_of_sub_tasks || 0;
          const notCompletedSubTasks =
            coreTaskValue.sub_tasks_not_completed || 0;
          const valueQuery = `(${simulationId}, ${coreTaskId}, 0, 0,
            ${totalTime}, ${validationFalse}, ${subTasks}, ${notCompletedSubTasks}, 
            ${score}, ${clicks})`;
          valuesArr.push(valueQuery);
        }
      );
      const valuesStr = valuesArr.join(",");
      const { rows: responseArr } = await pool.query(`${columns}${valuesStr}`);
      console.log(responseArr);
    });
    console.log("Everything is cool");
  } catch (err) {
    console.log(err);
  }
};

// insertCoreTasksSummary()

const insertManualFields = async () => {
  try {
    const params = {
      TableName: "main-site-prod-simulations",
      // KeyConditionExpression: "simulation_status = :simulation_status",
      // IndexName: "simulation_status-index",
      FilterExpression:
        "simulation_status = :simulation_status AND attribute_exists(manual_fields)",
      ExpressionAttributeValues: {
        ":simulation_status": "finished",
      },
      ProjectionExpression: "sessionId, manual_fields",
    };

    let response = await call("scan", params);
    let simulations = response.Items;
    while (response.LastEvaluatedKey) {
      params.ExclusiveStartKey = response.LastEvaluatedKey;
      response = await call("scan", params);
      if (response.Items.length > 0) {
        simulations = [...simulations, ...response.Items];
      }
    }

    const columns = `insert into manual_fields(simulation_id, core_task_id, score) values `;

    const { rows: coreTasks } = await pool.query(
      "select core_task_name,core_task_id  from core_tasks"
    );
    const { rows: simulationIds } = await pool.query(
      "select simulation_id, simulation_uuid from simulations"
    );

    simulations.forEach(async (currentSim) => {
      const simulation = simulationIds.find(
        (sim) => sim.simulation_uuid === currentSim.sessionId
      );
      if (!simulation) return;
      const simulationId = simulation.simulation_id;
      const manualFields = [];
      Object.entries(currentSim.manual_fields).forEach(
        ([coreTaskName, score]) => {
          const coreTask = coreTasks.find(
            (ct) => ct.core_task_name == coreTaskName
          );
          if (!coreTask) return;
          const coreTaskId = coreTask.core_task_id;

          const query = `(${simulationId}, ${coreTaskId}, ${score})`;
          manualFields.push(query);
        }
      );
      const manualFieldsStr = manualFields.join(",");
      const { rows: results } = await pool.query(
        `${columns}${manualFieldsStr}`
      );
    });
  } catch (err) {
    console.log(err);
  }
};

// insertManualFields();

const insertNodes = async () => {
  try {
    const params = {
      TableName: "main-site-prod-simulations",
      // KeyConditionExpression: "simulation_status = :simulation_status",
      // IndexName: "simulation_status-index",
      FilterExpression: "simulation_status = :simulation_status",
      ExpressionAttributeValues: {
        ":simulation_status": "finished",
      },
      ProjectionExpression: "sessionId, core_tasks_scores, final_score",
    };

    let response = await call("scan", params);
    let simulations = response.Items;
    while (response.LastEvaluatedKey) {
      params.ExclusiveStartKey = response.LastEvaluatedKey;
      response = await call("scan", params);
      if (response.Items.length > 0) {
        simulations = [...simulations, ...response.Items];
      }
    }

    const columns = `insert into nodes(simulation_id, core_task_id, entry_num, clicks, time, type, 
        source_node_id, source_scenario, source_flow, source_step, source_state, source_user_action, source_value,
        target_node_id, target_scenario, target_flow, target_step, target_state, target_user_action, target_value,
        start_time, end_time, total_time, sum_number_of_clicks, result,validation_false) values `;
    const arr = [];

    const { rows: coreTasks } = await pool.query(
      "select core_task_name,core_task_id  from core_tasks"
    );
    const { rows: simulationIds } = await pool.query(
      "select simulation_id, simulation_uuid from simulations"
    );

    const data = {};

    simulations.forEach((currentSim, i) => {
      const simulation = simulationIds.find(
        (sim) => sim.simulation_uuid === currentSim.sessionId
      );
      if (!simulation) return;

      const simulationId = simulation.simulation_id;
      data[simulationId] = {};
      // queryBuilder.push(simulationId);
      const coreTasksScores = currentSim.core_tasks_scores;
      if (!coreTasksScores) return;
      console.log(simulationId);
      Object.entries(coreTasksScores).forEach(
        ([coreTaskName, coreTaskData], j) => {
          const coreTask = coreTasks.find(
            (ct) => ct.core_task_name === coreTaskName
          );
          if (!coreTask) return;
          const coreTaskId = coreTask.core_task_id;
          data[simulationId][coreTaskId] = {};
          Object.entries(coreTaskData.sub_tasks_entries).forEach(
            async ([entryIndex, entry]) => {
              const queryBuilder = [simulationId, coreTaskId];
              const clicks = entry.clicks || false;
              const time = entry.time || false;
              queryBuilder.push(+entryIndex);
              queryBuilder.push(`'${clicks}'`);
              queryBuilder.push(`'${time}'`);
              const type = `'${entry.type || "time"}'`;
              queryBuilder.push(type);
              //source data
              const { source, target = {} } = entry;
              queryBuilder.push(`'${source.id}'`);
              queryBuilder.push(source.scenario || -1);
              queryBuilder.push(source.flow || -1);
              queryBuilder.push(source.step || -1);
              queryBuilder.push(`'${source.state || "state"}'`);
              queryBuilder.push(`'${source.userAction || "userAction"}'`);
              queryBuilder.push(`'${source.value || "value"}'`);
              //target data

              queryBuilder.push(`'${target.id || "id"}'`);
              queryBuilder.push(target.scenario || -1);
              queryBuilder.push(target.flow || -1);
              queryBuilder.push(target.step || -1);
              queryBuilder.push(`'${target.state || "state"}'`);
              queryBuilder.push(`'${target.userAction || "userAction"}'`);
              queryBuilder.push(`'${target.value || "value"}'`);

              queryBuilder.push(entry.start_time || 0);
              queryBuilder.push(entry.end_time || 0);
              queryBuilder.push(entry.total_time || 0);
              const sumNumberOfClicks = entry.sum_number_of_clicks || 0;
              queryBuilder.push(sumNumberOfClicks);
              queryBuilder.push(`'${entry.result || "result"}'`);
              const validationFalse = entry["Validation - false"] || 0;
              queryBuilder.push(`'${validationFalse}'`);
              const query = queryBuilder.join(",");
              const result = await pool.query(`${columns}(${query})`);
            }
          );
        }
      );
    });
    console.log("Everything is cool");

    // Object.entries(data).forEach(([simId, simData]) => {
    //   Object.entries(simData).forEach(async ([coreTaskId, entry]) => {
    //     const query = Object.entries(entry)
    //       .map(([entryIndex, entryValue]) => {
    //         const entryValueStr = entryValue.join(",");
    //         return `(${simId}, ${coreTaskId}, ${entryValueStr})`;
    //       })
    //       .join(",");
    //     const result = await pool.query(`${columns}${query}`);
    //   });
    // });
  } catch (err) {
    console.log(err);
  }
};
// insertNodes();

const insertScenarioHangout = async () => {
  try {
    const params = {
      TableName: "main-site-prod-simulations",
      // KeyConditionExpression: "simulation_status = :simulation_status",
      // IndexName: "simulation_status-index",
      FilterExpression:
        "simulation_status = :simulation_status AND attribute_exists(scenario_hangout)",
      ExpressionAttributeValues: {
        ":simulation_status": "finished",
      },
      ProjectionExpression: "sessionId, scenario_hangout",
    };

    let response = await call("scan", params);
    let simulations = response.Items;
    while (response.LastEvaluatedKey) {
      params.ExclusiveStartKey = response.LastEvaluatedKey;
      response = await call("scan", params);
      if (response.Items.length > 0) {
        simulations = [...simulations, ...response.Items];
      }
    }

    const columns = `insert into scenario_hangout(simulation_id, scenario_id, status) values `;

    const { rows: simulationIds } = await pool.query(
      "select simulation_id, simulation_uuid from simulations"
    );

    simulations.forEach(async (currentSim) => {
      const simulation = simulationIds.find(
        (sim) => sim.simulation_uuid === currentSim.sessionId
      );
      if (!simulation) return;
      const simulationId = simulation.simulation_id;
      const values = Object.entries(currentSim.scenario_hangout)
        .map(
          ([scenarioId, status]) =>
            `(${simulationId}, ${scenarioId},'${status}')`
        )
        .join(",");
      const result = await pool.query(`${columns}${values}`);
    });
    console.log("Everything is cool");
  } catch (err) {
    console.log(err);
  }
};

insertScenarioHangout();
