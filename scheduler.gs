var LOG_LEVEL = 0;

// ------------------------------------------------------------

Array.prototype.setAll = function(v) {
    var i, n = this.length;
    for (i = 0; i < n; ++i) {
        this[i] = v;
    }
};

Array.prototype.nrange = function() {
  for (var i=0; i<this.length; i++) {
    this[i] = i; 
  }
  return this;
};

Array.prototype.shuffle = function() {
    for (var j,x,i = this.length; i; j=Math.floor(Math.random()*i), x=this[--i], 
	  this[i]=this[j], this[j]=x);
    return this;
};

Array.prototype.jumble = function() {
  for (var i=0; i<this.length; i++) {
    this[i] = i; 
  }
  return this;
};

Array.prototype.matchAll = function(s) {
  for (var i=0; i<this.length; i++) {
    if (this[i].match(s) === null)
      return false;
  }
  return true;
};

Array.prototype.clone = function() {
	return this.slice(0);
};

Object.prototype.jsonClone = function() {
	return JSON.parse(JSON.stringify(this));
};

Object.prototype.jsonString = function() {
    return JSON.stringify(this, undefined, 4);
}

Array.prototype.compare = function (array) {
    if (!array)
        return false;

    if (this.length != array.length)
        return false;

    for (var i = 0, l=this.length; i < l; i++) {
        if (this[i] instanceof Array && array[i] instanceof Array) {
            if (!this[i].compare(array[i]))
                return false;
        }
        else if (this[i] != array[i]) {
            return false;
        }
    }
    return true;
}

if (!('trim' in String.prototype)) {
    String.prototype.trim= function() {
        return this.replace(/^\s+/, '').replace(/\s+$/, '');
    };
}

// ------------------------------------------------------------

/**
 * Print message to log and, optionally, to a cell
 */
function print(s, cell) {
  Logger.log(s);
  if (typeof cell !== "undefined") {
    cell.setValue(s);
  }
}

/**
 * Schedules the chores fairly amongst housemates
 */
function schedule() {
  print("Scheduler started");
  
  // 1  fetch sheet from spreadsheet; check format is roughly as expected
  print("(1) Check spreadsheet");
  
  //SpreadsheetApp.getActiveSpreadsheet().getActiveSheet()
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  print("Spreadsheet: " + spreadsheet.getName());
  
  var sheet_init = spreadsheet.getActiveSheet();
  var sheet_chores = spreadsheet.getSheetByName("Chores");  
  spreadsheet.setActiveSheet(sheet_chores)
  var sheet_current = spreadsheet.getActiveSheet();
  print("Set active sheet: " + sheet_init.getName() + " -> " + 
    sheet_chores.getName());
  if (sheet_current.getName() !== "Chores") {
    print("ERR: Invalid sheet - exiting");
    return;
  }
  
  var sheet_rows = sheet_current.getDataRange();
  var sheet_numRows = sheet_rows.getNumRows();
  var sheet_values = sheet_rows.getValues(); //r,c
  
  var COL_CHORES = 0;
  var COL_FREQ = 1;
  var COL_TIME = 2;
  var COL_SCHEDULE = 5;
  var COL_HOUSEMATES = 6;
  var COL_HOUSEMATES_END = sheet_values[0].length;
  
  var COL_CHART_HOUSEMATES = 6;
  var COL_CHART_EFFORT = 7;
  var COL_CHART_COST = 8;
  var ROW_CHART = null;
  
  var colheader = sheet_values[0];
  var colheader_expected = ["Shared Chore","Frequency","Time required"];
  if (colheader.slice(0,3).compare(colheader_expected)==false) {
    print("ERR: Column header format unexpected - exiting"); 
    return;
  }
  
  // 2  Find and clear the script output box
  print("(2) Find script output box");
  
  var cell_scriptBox = null;
  for (var r=0; r<sheet_numRows; r++) {
    if (sheet_values[r][0] === "SCRIPT OUTPUT (most recent)") {
      cell_scriptBox = sheet_current.getRange(r+2,1);
      print("Found Script output box on row " + String(r+2));
      cell_scriptBox.setValue(" ? ");
      break;
    }
  }
  if (cell_scriptBox == null) {
    print("ERR: Failed to find script output box - exiting");
    return;
  }

  // 3  Read in housemates
  print("(3) Find housemates");
  
  var housemate_colStart=COL_HOUSEMATES;
  var housemate_colEnd=COL_HOUSEMATES_END;
  var housemateCols=[];
  var housemates=[];
  for (var c=housemate_colStart; c<housemate_colEnd; c++) {
    if (colheader[c].indexOf(" rank") != -1) {
      housemateCols.push(c);
      var housemate=colheader[c].substr(0, colheader[c].indexOf(' '));
      housemates.push(String(housemate));
      print("Found housemate \"" + housemate + "\"");
    } else if (LOG_LEVEL > 0) {
      print("WARN: Column " + String(c+1) + " with header \"" + colheader[c] + 
	    "\" expected to contain a housemate. Skipped");
    }
  }
  if (housemates.length == 0) {
    print("ERR: No housemate chore ranking columns found - exiting", cell_scriptBox); 
    return;
  }
  
  // 4  Read in chores (including frequency, time, housemate ranking)
  print("(4) Find chores");
  
  var choreSet=[];
  
  //  4.1 find range of chores
  var chore_rowStart =1;
  var chore_rowEnd = -1;
  for (var r=1; r<sheet_numRows; r++) {
    if (sheet_values[r][COL_CHORES] === "end") {
      chore_rowEnd = r;
      print("Found 'end' marker on row " + String(r+1));
      break;
    }
  }
  if (chore_rowEnd < 0) {
    print("ERR: Failed to find 'end' marker at bottom of chores - exiting", 
	  cell_scriptBox);
    return;
  }
  
  //  4.2 read each row
  var nChores = 0;
  for (var r=1; r<chore_rowEnd; r++) {
    // pull sheet content & validate values
    var row = sheet_values[r];
    var choreStr = String(row[COL_CHORES]);
    var freqStr = String(row[COL_FREQ]);
    var timeStr = String(row[COL_TIME]);
    var housemateRanks = [];
    var housemateCount = 0;
    if (choreStr.trim() === '') {
      if (LOG_LEVEL > 0) 
	    print("WARN: Row " + String(r+1) + " is blank - ignoring");
    } else if (freqStr.match("[1-3]") === null) {
      if (LOG_LEVEL > 0) 
	    print("WARN: Row " + String(r+1) + 
		  ", chore frequency not in range [1-3] - ignoring chore '" +choreStr+ "'");
    } else if (timeStr.match("[1-5]") === null) {
      if (LOG_LEVEL > 0) 
	    print("WARN: Row " + String(r+1) + 
		  ", chore time required not in range [1-5] - ignoring chore '" + choreStr + 
		  "'");
    } else {
      // housemate prefs
      for (var i=0; i<housemateCols.length; i++) {
        var rankStr = String(row[housemateCols[i]]);
        if (rankStr.trim() === '') {
          if (LOG_LEVEL > 0)
            print("WARN: Row " + String(r+1) + ", no preference for '" + 
			  housemates[i] + "' doing '" + choreStr + "' - defaulting to 3");
          rankStr = "3";
        }
        if (rankStr.match("[1-5]") === null) {
          if (LOG_LEVEL > 0) 
            print("WARN: Row " + String(r+1) + ", '" + housemates[i] + 
			  "' preference for doing '" + choreStr + "' not in range [1-5]. " +
              "Housemate will not be considered for this chore");
          housemateRanks.push(-1);
        } else {
          housemateCount++;
          housemateRanks.push(parseInt(rankStr));
        }
      }
      if (housemateCount == 0) {
        if (LOG_LEVEL > 0) 
		print("WARN: Row " + String(r+1) + 
		  ", no housemate preferences set - ignoring chore '" + choreStr + "'");
      } else {    
        // values valid - create a chore
        print("Valid chore on row " + String(r+1) + " - '" + choreStr + "'");
        nChores++;
        choreSet.push({
          name: choreStr, row: r, frequency: parseInt(freqStr), 
		  time: parseInt(timeStr), housemateWeights: housemateRanks.clone(), 
          housemateAssigned: null, cost: 0
        });
      }
    }
  }
  if (nChores == 0) {
    print("ERR: Failed to find any chores to schedule - exiting", cell_scriptBox);
    return;
  } else if (LOG_LEVEL > 1) {
    print("=== CHORES ===");
    print(choreSet.jsonString()); 
    print("=== END CHORES ===");
  }

  // 5  Create "template" schedule (includes choreSet, housemateSet & some metadata
  print("(5) Create 'template' schedule to work with");
  
  // generate housemate set
  var housemateSet=[];
  for (var i=0; i<housemates.length; i++) {
    housemateSet.push({
      name: String(housemates[i]),
      column: housemateCols[i],
      chores: [],
      sumCost: 0,
      sumEffort :0,
      minRank: housemateMinRank(choreSet, i),
      maxRank: housemateMaxRank(choreSet, i)
    });
  }
  // generate schedule
  var templateSchedule={
    choreSet: choreSet.jsonClone(),
    housemateSet: housemateSet.jsonClone(),
    maxCostDiff: 0
  };
  
  // 6 Choose the 'best' schedule
  print("(6) Choose the  best chore schedule");
  var winnerSchedule = chooseBestSchedule(templateSchedule);
  
  /**
  // SPLIT INTO FUNCTIONS DEPENDING ON METHOD; RETURN WINNER
  //  - round robin
  //  X- generate all schedules (too expensive - exponential complexity)
  **/
  
  // 7 graph & print housemate stats (readable by the housemates)
  print("(7) Plotting housemate stats on spreadsheet");
  
  for (var r=0; r<sheet_numRows; r++) {
    if (sheet_values[r][COL_CHART_HOUSEMATES] === "Housemate") {
      print("Found start of chart data entry at row " + String(r+1));
      ROW_CHART = r+2; // it's actually 2 below the row
      break;
    }
  }
  if (ROW_CHART == null) {
    print("ERR: Failed to find start of chart data entry - exiting");
    return;
  }
  
  sheet_current.getRange(1+ROW_CHART, 1+COL_CHART_HOUSEMATES, 13, 3).setValue("");
  var newChartDataRange = sheet_current.getRange(1+ROW_CHART -1, 
    1+COL_CHART_HOUSEMATES, housemates.length +1, 3);
  
  // 7.1 entering housemate data cells
  for (var h=0; h<housemates.length; h++) {
    var cell_housemate = sheet_current.getRange(1+ROW_CHART+h, 
      COL_CHART_HOUSEMATES+1); 
    var cell_effort = sheet_current.getRange(1+ROW_CHART+h, COL_CHART_EFFORT+1);
    var cell_cost = sheet_current.getRange(1+ROW_CHART+h, COL_CHART_COST+1);
    cell_housemate.setValue(winnerSchedule.housemateSet[h].name);
    cell_effort.setValue(winnerSchedule.housemateSet[h].sumEffort);
    cell_cost.setValue(winnerSchedule.housemateSet[h].sumCost);
  }
  
  var charts = sheet_current.getCharts();
  if (charts.length != 1) {
    print("ERR: Expected to find exactly 1 chart in the spreadsheet - exiting", 
	  cell_scriptBox);
    return;
  }
  var chart = charts[0];
  var ranges = chart.getRanges();
  var builder = chart.modify();
  if (ranges.length != 1) {
    print("ERR: Expected to find exactly 1 dataset for the chart - exiting", 
	  cell_scriptBox);
    return;
  }
  var range = ranges[0];
  builder.removeRange(range);
  builder.addRange(newChartDataRange);
  sheet_current.updateChart(builder.build());
  
  
  // 8  print schedule to sheet
  print("(8) Writing schedule on spreadsheet");
  if (LOG_LEVEL > 1) {
    print("=== WINNER SCHEDULE ===");
    print(winnerSchedule.jsonString()); 
    print("=== END SCHEDULE ===");
  }
    
  sheet_current.getRange(2, COL_SCHEDULE+1, chore_rowEnd-chore_rowStart,1).setValue("-");
  for (var i=0; i<winnerSchedule.choreSet.length; i++) {
    var chore = winnerSchedule.choreSet[i];
    sheet_current.getRange(chore.row+1, COL_SCHEDULE+1).setValue(
      winnerSchedule.housemateSet[chore.housemateAssigned].name
    );
  }
  
  print("Scheduler finished - OK");
  Browser.msgBox("Re-scheduling finished :) Computer says: do your chores!");
  cell_scriptBox.setValue(Logger.getLog());
};

// ------------------------------------------------------------

/*

choreSet : [
0 : {name, row, frequency, time, housemateWeights : [1,1,1], housemateAssigned, cost},
1 : {},
...
]

schedule : {
  choreSet, //ordered
  housemateSet,
  maxCostDiff // all costs here are per housemate
}

housemateSet : [
0 : {name, column, chores : [0,3,4,7,10], sumCost, sumEffort, minRank, maxRank},
1 : {},
...
]

*/

function highestEffortChore(choreSet, housemateNum) {
  var chore=-1;
  var bestEffort=0;
  for (var c=0; c<choreSet.length; c++) {
    var effort = choreSet[c].frequency*choreSet[c].time;
    if (choreSet[c].housemateWeights[housemateNum] > 0) {
      if (effort > bestEffort) {
        bestEffort = effort;
        chore = c;
      }
    }
  }
  return chore;
}

function lowestEffortChore(choreSet, housemateNum) {
  var chore=-1;
  var bestEffort=Number.MAX_VALUE;
  for (var c=0; c<choreSet.length; c++) {
    var effort = choreSet[c].frequency*choreSet[c].time;
    if (choreSet[c].housemateWeights[housemateNum] > 0) {
      if (effort < bestEffort) {
        bestEffort = effort;
        chore = c;
      }
    }
  }
  return chore;
}

/** Lowest total cost of any housemate in schedule 
 **/
function minHousemateCost(housemateSet) {
  var cost=Number.MAX_VALUE;
  for (var h=0; h<housemateSet.length; h++) {
    var thisCost = housemateSet[h].sumCost;
    if (cost > thisCost) {
      cost = thisCost; 
    }
  }
  return cost;
}

/** Highest total cost of any housemate in schedule 
 **/
function maxHousemateCost(housemateSet) {
  var cost=0;
  for (var h=0; h<housemateSet.length; h++) {
    var thisCost = housemateSet[h].sumCost;
    if (cost < thisCost) {
      cost = thisCost; 
    }
  }
  return cost;
}

/** Lowest chore ranking entered by a housemate
 **/
function housemateMinRank(choreSet, housemateNum) {
  var rank=Number.MAX_VALUE;
  for (var c=0; c<choreSet.length; c++) {
    var thisRank = choreSet[c].housemateWeights[housemateNum];
    if ((rank > thisRank) && (thisRank > 0)) {
      rank = thisRank;
    }
  }
  return rank;
}

/** Highest chore ranking entered by a housemate
 **/
function housemateMaxRank(choreSet, housemateNum) {
  var rank=0;
  for (var c=0; c<choreSet.length; c++) {
    var thisRank = choreSet[c].housemateWeights[housemateNum];
    if (rank < thisRank) {
      rank = thisRank; 
    }
  }
  return rank;
}

/** Cost of a chore to a housemate
 **/
function choreCost(chore, housemate, housemateNum) {
  var RANK_WEIGHT = 1;
  var rank = chore.housemateWeights[housemateNum];
  
  if (chore.housemateWeights[housemateNum] < 0)
    return -1; 
  return (chore.frequency*chore.time*(1 + RANK_WEIGHT*(
	  (1+(rank - housemate.minRank))/(1+(housemate.maxRank - housemate.minRank))
    )));
}

/** Lowest-cost chore available to a housemate, according to his/her rankings
 **/
function lowestCostChore(choreSet, housemate, housemateNum) {
  var bestChore = -1;
  var bestCost  = Number.MAX_VALUE; 
  for (var c=0; c<choreSet.length; c++) {
    if (choreSet[c].housemateWeights[housemateNum] > 0) {
      var thisCost = choreCost(choreSet[c], housemate, housemateNum);
      if (thisCost < 0) throw "lowestCostChore: choreCost should not be -1";
      if (bestCost > thisCost) {
        bestChore = c; 
        bestCost  = thisCost;
      }
    }
  }
  return bestChore;
}

function scheduleSort(x, y) {
  return (x.maxCostDiff - y.maxCostDiff);
}

**/

// ------------------------------------------------------------

function chooseBestSchedule(tSchedule) {
  // ROUND ROBIN
  //
  //Method A
  // while chores to schedule:
  //   generate randomised list of housemates
  //   for each housemate, assign them the most-effort remaining chore (prioritise favourite chores where chores have same effort)
  //
  //Method B
  //   for each housemate, assign them the least-effort remaining chore (prioritise favourite chores where chores have same effort)
  //
  //Method C
  //   for each housemate, assign them the lowest-cost remaining chore
  //
  //For each method, do it N times and add it to the pool
  //Then, sort the pool by maxCostDiff & select the top schedule
  // if more than one schedule has the same score as the top one, choose randomly from them
  
  //Math.abs(a - b) < epsilon
  
  var scheduleSet=[];
  var nChores=tSchedule.choreSet.length;
  var nHousemates=tSchedule.housemateSet.length;
  
  var N_RANDOMIZATIONS = 25;
  
  // round-robin loop over all methods, #randomizations, in a constantly shuffled order of housemates
  for (var method=0; method<3; method++) {
    for (var n=0; n<N_RANDOMIZATIONS; n++) {
      var choresIn = tSchedule.choreSet.jsonClone();
      var scheduleOut = tSchedule.jsonClone();
      scheduleOut.choreSet = [];
      
      while (choresIn.length > 0) {
        var housemateOrder = Array(nHousemates).nrange().shuffle();
        for (var i=0; i<nHousemates; i++) {
          var c=-1;
          if (method==0) {
            //METHOD A
            c = highestEffortChore(choresIn, housemateOrder[i]);
          } else if (method==1) {
            //METHOD B
            c = lowestEffortChore(choresIn, housemateOrder[i]);
          } else {
            //METHOD C
            c = lowestCostChore(choresIn, scheduleOut.housemateSet[housemateOrder[i]],
              housemateOrder[i]);
          }
          //skip if housemate cannot do any remaining chores
          if (c >= 0) {
            //when pushing a chore in, assign the housemate & compute their cost in both the schedule & housemateSet
            var chore = choresIn.splice(c,1)[0];
            chore.housemateAssigned = housemateOrder[i];
            chore.cost = choreCost(chore, 
	          scheduleOut.housemateSet[chore.housemateAssigned], 
			  chore.housemateAssigned); 
            scheduleOut.housemateSet[chore.housemateAssigned].sumCost += chore.cost;
            scheduleOut.housemateSet[chore.housemateAssigned].sumEffort += 
			  chore.frequency*chore.time;
            scheduleOut.housemateSet[chore.housemateAssigned].chores.push(
			  scheduleOut.choreSet.length);
            scheduleOut.choreSet.push(chore.jsonClone());
          }
          // break if no chores left
          if (choresIn.length==0) break;
        }
      }
      
      // compute schedule stats
      var maxCost = maxHousemateCost(scheduleOut.housemateSet);
      var minCost = minHousemateCost(scheduleOut.housemateSet);
      scheduleOut.maxCostDiff = Math.abs(maxCost - minCost);
      
      // add to the set
      scheduleSet.push(scheduleOut.jsonClone());
    }
  }
  if (LOG_LEVEL > 2) {
    print("scheduleSet :: "+String(scheduleSet.length));
    print(scheduleSet.jsonString());
  }
  
  scheduleSet.sort(scheduleSort);  
  return scheduleSet[0].jsonClone();
}

// ------------------------------------------------------------

function onOpen() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var spreadsheetname = spreadsheet.getName();
  var schedulerEntries = [{
    name : "Re-schedule chores",
    functionName : "schedule"
  }];
  
  Logger.log("Sharehouse Chore Allocator Script spreadsheet - adding task scheduler");
  spreadsheet.addMenu("Chores", schedulerEntries);
  
};

// ------------------------------------------------------------

/*
Notes:
 - could easily expand to sort by effort instead of preferences. Look at line ~580+
 */
