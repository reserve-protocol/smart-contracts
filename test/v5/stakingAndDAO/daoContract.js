const TestToken = artifacts.require("Token.sol");
const DAOContract = artifacts.require("MockDAOContract.sol");
const StakingContract = artifacts.require("StakingContract.sol");
const MockFeeHandler = artifacts.require("MockFeeHandler.sol");
const Helper = require("../../v4/helper.js");

const BN = web3.utils.BN;

const precision = (new BN(10).pow(new BN(18)));
const zeroAddress = '0x0000000000000000000000000000000000000000';

let admin;

let currentBlock;

let epochPeriod = 20;
let startBlock;
let kncToken;
let stakingContract;
let feeHandler;
let daoContract;
let victor;
let loi;
let mike;
let poolMaster;
let maxCampOptions = 4;
let minCampPeriod = 10; // 10 blocks
let defaultNetworkFee = 25;
let defaultBrrData = getDataFromRebateAndReward(25, 25);
let minPercentageInPrecision = new BN(precision).div(new BN(5)); // 20%
// Y = C - t * X
// Example: X = 20%, C = 100%, t = 1
// Y = 100% - 1 * 20% = 80%
let cInPrecision = new BN(precision); // 100%
let tInPrecision = new BN(precision); // 1
let formulaParamsData = getFormulaParamsData(minPercentageInPrecision, cInPrecision, tInPrecision);

let initVictorStake = mulPrecision(1000);
let initMikeStake = mulPrecision(2000);
let initLoiStake = mulPrecision(3000);

contract('DAOContract', function(accounts) {
    before("one time init", async() => {
        admin = accounts[1];
        kncToken = await TestToken.new("Kyber Network Crystal", "KNC", 18);
        victor = accounts[2];
        loi = accounts[3];
        mike = accounts[4];
        admin = accounts[5];
        poolMaster = accounts[6];
        feeHandler = await MockFeeHandler.new();

        await kncToken.transfer(victor, mulPrecision(1000000));
        await kncToken.transfer(mike, mulPrecision(1000000));
        await kncToken.transfer(loi, mulPrecision(1000000));
    });

    beforeEach("running before each test", async() => {
        currentBlock = await Helper.getCurrentBlock();
    });

    const deployContracts = async(_epochPeriod, _startBlock, _campPeriod) => {
        epochPeriod = _epochPeriod;
        startBlock = _startBlock;
        stakingContract = await StakingContract.new(kncToken.address, epochPeriod, startBlock, admin);

        minCampPeriod = _campPeriod;
        daoContract = await DAOContract.new(
            epochPeriod, startBlock,
            stakingContract.address,  feeHandler.address, kncToken.address,
            maxCampOptions, minCampPeriod, defaultNetworkFee, defaultBrrData,
            admin
        )
        await stakingContract.updateDAOAddressAndRemoveAdmin(daoContract.address, {from: admin});
    };

    const setupSimpleStakingData = async() => {
        // approve tokens
        await kncToken.approve(stakingContract.address, mulPrecision(1000000), {from: victor});
        await kncToken.approve(stakingContract.address, mulPrecision(1000000), {from: mike});
        await kncToken.approve(stakingContract.address, mulPrecision(1000000), {from: loi});

        await stakingContract.deposit(initVictorStake, {from: victor});
        await stakingContract.deposit(initMikeStake, {from: mike});
        await stakingContract.deposit(initLoiStake, {from: loi});
    };

    describe("#Handle Withdrawl Tests", () => {
        it("Test handle withdrawal should revert when sender is not staking", async function() {
            daoContract = await DAOContract.new(
                10, currentBlock + 10,
                mike,  feeHandler.address, kncToken.address,
                maxCampOptions, minCampPeriod, defaultNetworkFee, defaultBrrData,
                admin
            )

            try {
                await daoContract.handleWithdrawal(victor, 0, {from: victor});
                assert(false, "throw was expected in line above");
            } catch (e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }

            try {
                await daoContract.handleWithdrawal(victor, mulPrecision(10), {from: admin});
                assert(false, "throw was expected in line above");
            } catch (e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }

            await daoContract.handleWithdrawal(victor, 0, {from: mike});
        });

        it("Test handle withdrawal update correct points and vote count - no delegation", async function() {
            await deployContracts(20, currentBlock + 20, 10);
            await setupSimpleStakingData();

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock - 1);

            currentBlock = await Helper.getCurrentBlock();
            let link = web3.utils.fromAscii("https://kyberswap.com");
            await daoContract.submitNewCampaign(
                0, currentBlock + 3, currentBlock + 3 + minCampPeriod,
                formulaParamsData, [1, 2, 3, 4], link, {from: admin}
            );

            // withdraw when no votes
            let totalPoints = new BN(0);
            Helper.assertEqual(totalPoints, await daoContract.getTotalPoints(1), "points should be correct");
            await stakingContract.withdraw(mulPrecision(10), {from: victor});
            Helper.assertEqual(totalPoints, await daoContract.getTotalPoints(1), "points should be correct");

            await daoContract.vote(1, 1, {from: victor});

            totalPoints.iadd(initVictorStake).isub(mulPrecision(10));
            let voteCount1 = new BN(0);
            voteCount1.iadd(initVictorStake).isub(mulPrecision(10));

            Helper.assertEqual(totalPoints, await daoContract.getTotalPoints(1), "points should be correct");

            let voteData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(voteData[1], totalPoints, "total camp votes is incorrect");
            Helper.assertEqual(voteData[0][0], voteCount1, "option voted count is incorrect");
            Helper.assertEqual(voteData[0][1], 0, "option voted count is incorrect");

            await stakingContract.withdraw(mulPrecision(100), {from: victor});

            totalPoints.isub(mulPrecision(100));
            voteCount1.isub(mulPrecision(100));

            Helper.assertEqual(totalPoints, await daoContract.getTotalPoints(1), "points should be correct");

            voteData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(voteData[1], totalPoints, "total camp votes is incorrect");
            Helper.assertEqual(voteData[0][0], voteCount1, "option voted count is incorrect");
            Helper.assertEqual(voteData[0][1], 0, "option voted count is incorrect");

            await stakingContract.withdraw(mulPrecision(100), {from: mike});

            Helper.assertEqual(totalPoints, await daoContract.getTotalPoints(1), "points should be correct");

            voteData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(voteData[1], totalPoints, "total camp votes is incorrect");
            Helper.assertEqual(voteData[0][0], voteCount1, "option voted count is incorrect");
            Helper.assertEqual(voteData[0][1], 0, "option voted count is incorrect");

            await daoContract.vote(1, 2, {from: mike});
            totalPoints.iadd(initMikeStake).isub(mulPrecision(100));
            let voteCount2 = initMikeStake.sub(mulPrecision(100));

            Helper.assertEqual(totalPoints, await daoContract.getTotalPoints(1), "points should be correct");

            voteData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(voteData[1], totalPoints, "total camp votes is incorrect");
            Helper.assertEqual(voteData[0][0], voteCount1, "option voted count is incorrect");
            Helper.assertEqual(voteData[0][1], voteCount2, "option voted count is incorrect");
            Helper.assertEqual(voteData[0][2], 0, "option voted count is incorrect");

            await stakingContract.withdraw(mulPrecision(100), {from: mike});
            totalPoints.isub(mulPrecision(100));
            voteCount2.isub(mulPrecision(100));

            Helper.assertEqual(totalPoints, await daoContract.getTotalPoints(1), "points should be correct");

            voteData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(voteData[1], totalPoints, "total camp votes is incorrect");
            Helper.assertEqual(voteData[0][0], voteCount1, "option voted count is incorrect");
            Helper.assertEqual(voteData[0][1], voteCount2, "option voted count is incorrect");
            Helper.assertEqual(voteData[0][2], 0, "option voted count is incorrect");

            await stakingContract.deposit(mulPrecision(200), {from: victor});

            Helper.assertEqual(totalPoints, await daoContract.getTotalPoints(1), "points should be correct");

            voteData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(voteData[1], totalPoints, "total camp votes is incorrect");
            Helper.assertEqual(voteData[0][0], voteCount1, "option voted count is incorrect");
            Helper.assertEqual(voteData[0][1], voteCount2, "option voted count is incorrect");
            Helper.assertEqual(voteData[0][2], 0, "option voted count is incorrect");

            // less than new deposit (200)
            await stakingContract.withdraw(mulPrecision(100), {from: victor});

            Helper.assertEqual(totalPoints, await daoContract.getTotalPoints(1), "points should be correct");

            voteData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(voteData[1], totalPoints, "total camp votes is incorrect");
            Helper.assertEqual(voteData[0][0], voteCount1, "option voted count is incorrect");
            Helper.assertEqual(voteData[0][1], voteCount2, "option voted count is incorrect");
            Helper.assertEqual(voteData[0][2], 0, "option voted count is incorrect");

            // total withdraw is 400 more than new deposit (200)
            await stakingContract.withdraw(precision.mul(new BN(300)), {from: victor});

            totalPoints.isub(mulPrecision(200));
            voteCount1.isub(mulPrecision(200));
            Helper.assertEqual(totalPoints, await daoContract.getTotalPoints(1), "points should be correct");

            voteData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(voteData[1], totalPoints, "total camp votes is incorrect");
            Helper.assertEqual(voteData[0][0], voteCount1, "option voted count is incorrect");
            Helper.assertEqual(voteData[0][1], voteCount2, "option voted count is incorrect");
            Helper.assertEqual(voteData[0][2], 0, "option voted count is incorrect");

            // change vote of victor from 1 to 2, make sure vote counts change correctly after withdraw
            await daoContract.vote(1, 2, {from: victor});
            voteCount2.iadd(voteCount1);
            voteCount1 = new BN(0);

            Helper.assertEqual(totalPoints, await daoContract.getTotalPoints(1), "points should be correct");

            voteData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(voteData[1], totalPoints, "total camp votes is incorrect");
            Helper.assertEqual(voteData[0][0], voteCount1, "option voted count is incorrect");
            Helper.assertEqual(voteData[0][1], voteCount2, "option voted count is incorrect");
            Helper.assertEqual(voteData[0][2], 0, "option voted count is incorrect");

            await stakingContract.withdraw(mulPrecision(100), {from: victor});

            totalPoints.isub(mulPrecision(100));
            voteCount2.isub(mulPrecision(100));

            Helper.assertEqual(totalPoints, await daoContract.getTotalPoints(1), "points should be correct");

            voteData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(voteData[1], totalPoints, "total camp votes is incorrect");
            Helper.assertEqual(voteData[0][0], voteCount1, "option voted count is incorrect");
            Helper.assertEqual(voteData[0][1], voteCount2, "option voted count is incorrect");
            Helper.assertEqual(voteData[0][2], 0, "option voted count is incorrect");
        });

        it("Test handle withdrawal updates correct points with multiple voted campaigns - no delegation", async function() {
            await deployContracts(100, currentBlock + 20, 10);
            await setupSimpleStakingData();

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock - 1);

            currentBlock = await Helper.getCurrentBlock();
            let link = web3.utils.fromAscii("https://kyberswap.com");
            await daoContract.submitNewCampaign(
                0, currentBlock + 3, currentBlock + 3 + minCampPeriod,
                formulaParamsData, [1, 2, 3, 4], link, {from: admin}
            );

            // deplay to start of first camp
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 3);
            // vote for first campaign
            await daoContract.vote(1, 1, {from: victor});

            // check total points
            let totalEpochPoints = (new BN(0)).add(initVictorStake);
            let totalCampPoint1 = (new BN(0)).add(initVictorStake);
            let voteCount11 = (new BN(0)).add(initVictorStake);
            // check pts and vote counts
            Helper.assertEqual(totalEpochPoints, await daoContract.getTotalPoints(1), "points should be correct");
            let voteData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(voteData[1], totalCampPoint1, "total camp votes is incorrect");
            Helper.assertEqual(voteData[0][0], voteCount11, "option voted count is incorrect");

            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                1, currentBlock + 2, currentBlock + 2 + minCampPeriod,
                formulaParamsData, [1, 2, 3, 4], link, {from: admin}
            );

            // vote for first campaign
            await daoContract.vote(2, 2, {from: victor});

            totalEpochPoints.iadd(initVictorStake);
            let totalCampPoint2 = (new BN(0)).add(initVictorStake);
            let voteCount22 = (new BN(0)).add(initVictorStake);

            // check pts and vote counts
            Helper.assertEqual(totalEpochPoints, await daoContract.getTotalPoints(1), "points should be correct");
            voteData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(voteData[1], totalCampPoint1, "total camp votes is incorrect");
            Helper.assertEqual(voteData[0][0], voteCount11, "option voted count is incorrect");
            voteData = await daoContract.getCampaignVoteCountData(2);
            Helper.assertEqual(voteData[1], totalCampPoint2, "total camp votes is incorrect");
            Helper.assertEqual(voteData[0][1], voteCount22, "option voted count is incorrect");

            await stakingContract.withdraw(mulPrecision(100), {from: victor});
            // update points and vote counts
            totalEpochPoints.isub(mulPrecision(100 * 2));
            totalCampPoint1.isub(mulPrecision(100));
            voteCount11.isub(mulPrecision(100));
            totalCampPoint2.isub(mulPrecision(100));
            voteCount22.isub(mulPrecision(100));

            // check pts and vote counts
            Helper.assertEqual(totalEpochPoints, await daoContract.getTotalPoints(1), "points should be correct");
            voteData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(voteData[1], totalCampPoint1, "total camp votes is incorrect");
            Helper.assertEqual(voteData[0][0], voteCount11, "option voted count is incorrect");
            voteData = await daoContract.getCampaignVoteCountData(2);
            Helper.assertEqual(voteData[1], totalCampPoint2, "total camp votes is incorrect");
            Helper.assertEqual(voteData[0][1], voteCount22, "option voted count is incorrect");

            await daoContract.vote(1, 2, {from: victor});
            // check pts and vote counts
            Helper.assertEqual(totalEpochPoints, await daoContract.getTotalPoints(1), "points should be correct");
            voteData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(voteData[1], totalCampPoint1, "total camp votes is incorrect");
            Helper.assertEqual(voteData[0][1], voteCount11, "option voted count is incorrect");
            voteData = await daoContract.getCampaignVoteCountData(2);
            Helper.assertEqual(voteData[1], totalCampPoint2, "total camp votes is incorrect");
            Helper.assertEqual(voteData[0][1], voteCount22, "option voted count is incorrect");

            // delay to end of campaign 1
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 5);

            // withdraw should change epoch points, but only camp2 vote data
            await stakingContract.withdraw(mulPrecision(100), {from: victor});
            // update points and vote counts, only campaign 2 voted counts are updated
            totalEpochPoints.isub(mulPrecision(100 * 2));
            totalCampPoint2.isub(mulPrecision(100));
            voteCount22.isub(mulPrecision(100));
            // check pts and vote counts
            Helper.assertEqual(totalEpochPoints, await daoContract.getTotalPoints(1), "points should be correct");
            voteData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(voteData[1], totalCampPoint1, "total camp votes is incorrect");
            Helper.assertEqual(voteData[0][1], voteCount11, "option voted count is incorrect");
            voteData = await daoContract.getCampaignVoteCountData(2);
            Helper.assertEqual(voteData[1], totalCampPoint2, "total camp votes is incorrect");
            Helper.assertEqual(voteData[0][1], voteCount22, "option voted count is incorrect");

            currentBlock = await Helper.getCurrentBlock();
            // create new campaign far from current block
            await daoContract.submitNewCampaign(
                2, currentBlock + 20, currentBlock + 20 + minCampPeriod,
                formulaParamsData, [1, 2, 3, 4], link, {from: admin}
            );

            // withdraw should change epoch points, but only camp2 vote data
            await stakingContract.withdraw(mulPrecision(100), {from: victor});
            // update points and vote counts, only campaign 2 voted counts are updated
            totalEpochPoints.isub(mulPrecision(100 * 2));
            totalCampPoint2.isub(mulPrecision(100));
            voteCount22.isub(mulPrecision(100));
            // check pts and vote counts
            Helper.assertEqual(totalEpochPoints, await daoContract.getTotalPoints(1), "points should be correct");
            voteData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(voteData[1], totalCampPoint1, "total camp votes is incorrect");
            Helper.assertEqual(voteData[0][1], voteCount11, "option voted count is incorrect");
            voteData = await daoContract.getCampaignVoteCountData(2);
            Helper.assertEqual(voteData[1], totalCampPoint2, "total camp votes is incorrect");
            Helper.assertEqual(voteData[0][1], voteCount22, "option voted count is incorrect");
            // data for camp 3 should be 0
            voteData = await daoContract.getCampaignVoteCountData(3);
            Helper.assertEqual(voteData[1], 0, "total camp votes is incorrect");
        });

        it("Test handle withdrawal updates correct data after withdraw - with delegation", async function() {
            await deployContracts(50, currentBlock + 15, 20);
            await setupSimpleStakingData();
            await stakingContract.delegate(mike, {from: victor});
            await stakingContract.delegate(victor, {from: loi});

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock);

            currentBlock = await Helper.getCurrentBlock();
            let link = web3.utils.fromAscii("https://kyberswap.com");
            await daoContract.submitNewCampaign(
                0, currentBlock + 3, currentBlock + 3 + minCampPeriod,
                formulaParamsData, [1, 2, 3, 4], link, {from: admin}
            );

            // deplay to start of first camp
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 3);

            // vote for first campaign
            await daoContract.vote(1, 1, {from: mike});

            // check total points
            let totalEpochPoints = (new BN(0)).add(initVictorStake).add(initMikeStake);
            let totalCampPoint1 = (new BN(0)).add(initVictorStake).add(initMikeStake);
            let voteCount11 = (new BN(0)).add(initVictorStake).add(initMikeStake);

            // check pts and vote counts
            Helper.assertEqual(totalEpochPoints, await daoContract.getTotalPoints(1), "points should be correct");
            let voteData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(voteData[1], totalCampPoint1, "total camp votes is incorrect");
            Helper.assertEqual(voteData[0][0], voteCount11, "option voted count is incorrect");

            let victorWithdrewAmt = mulPrecision(100);
            await stakingContract.withdraw(victorWithdrewAmt, {from: victor});

            totalEpochPoints.isub(victorWithdrewAmt);
            totalCampPoint1.isub(victorWithdrewAmt);
            voteCount11.isub(victorWithdrewAmt);

            // check pts and vote counts
            Helper.assertEqual(totalEpochPoints, await daoContract.getTotalPoints(1), "points should be correct");
            voteData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(voteData[1], totalCampPoint1, "total camp votes is incorrect");
            Helper.assertEqual(voteData[0][0], voteCount11, "option voted count is incorrect");

            // withdraw from staker with no votes
            await stakingContract.withdraw(mulPrecision(10), {from: loi});
            // check pts and vote counts
            Helper.assertEqual(totalEpochPoints, await daoContract.getTotalPoints(1), "points should be correct");
            voteData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(voteData[1], totalCampPoint1, "total camp votes is incorrect");
            Helper.assertEqual(voteData[0][0], voteCount11, "option voted count is incorrect");

            await daoContract.vote(1, 2, {from: victor});
            // note: Loi already withdraw 10 knc
            totalEpochPoints.iadd(initLoiStake).isub(mulPrecision(10));
            totalCampPoint1.iadd(initLoiStake).isub(mulPrecision(10));
            let voteCount12 = (new BN(0)).add(initLoiStake).isub(mulPrecision(10));

            // check pts and vote counts
            Helper.assertEqual(totalEpochPoints, await daoContract.getTotalPoints(1), "points should be correct");
            voteData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(voteData[1], totalCampPoint1, "total camp votes is incorrect");
            Helper.assertEqual(voteData[0][0], voteCount11, "option voted count is incorrect");
            Helper.assertEqual(voteData[0][1], voteCount12, "option voted count is incorrect");

            await daoContract.vote(1, 3, {from: loi});
            // check pts and vote counts, nothing should be changed
            Helper.assertEqual(totalEpochPoints, await daoContract.getTotalPoints(1), "points should be correct");
            voteData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(voteData[1], totalCampPoint1, "total camp votes is incorrect");
            Helper.assertEqual(voteData[0][0], voteCount11, "option voted count is incorrect");
            Helper.assertEqual(voteData[0][1], voteCount12, "option voted count is incorrect");

            await stakingContract.delegate(loi, {from: victor});

            // check pts and vote counts, nothing should be changed
            Helper.assertEqual(totalEpochPoints, await daoContract.getTotalPoints(1), "points should be correct");
            voteData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(voteData[1], totalCampPoint1, "total camp votes is incorrect");
            Helper.assertEqual(voteData[0][0], voteCount11, "option voted count is incorrect");
            Helper.assertEqual(voteData[0][1], voteCount12, "option voted count is incorrect");

            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                0, currentBlock + 3, currentBlock + 3 + minCampPeriod,
                formulaParamsData, [1, 2, 3, 4], link, {from: admin}
            );
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 2);

            await daoContract.vote(2, 1, {from: mike});
            totalEpochPoints.iadd(initMikeStake).iadd(initVictorStake).isub(victorWithdrewAmt);
            let totalCampPoint2 = (new BN(0)).add(initMikeStake).add(initVictorStake).sub(victorWithdrewAmt);
            let voteCount21 = (new BN(0)).add(initMikeStake).add(initVictorStake).sub(victorWithdrewAmt);

            // check pts and vote counts
            Helper.assertEqual(totalEpochPoints, await daoContract.getTotalPoints(1), "points should be correct");
            voteData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(voteData[1], totalCampPoint1, "total camp votes is incorrect");
            Helper.assertEqual(voteData[0][0], voteCount11, "option voted count is incorrect");
            Helper.assertEqual(voteData[0][1], voteCount12, "option voted count is incorrect");
            voteData = await daoContract.getCampaignVoteCountData(2);
            Helper.assertEqual(voteData[1], totalCampPoint2, "total camp votes is incorrect");
            Helper.assertEqual(voteData[0][0], voteCount21, "option voted count is incorrect");

            await stakingContract.withdraw(mulPrecision(200), {from: victor});
            victorWithdrewAmt.iadd(mulPrecision(200));

            // change data for vote of mike, not for vote of victor as delegated to mike already
            totalEpochPoints.isub(mulPrecision(200 * 2));
            totalCampPoint1.isub(mulPrecision(200));
            voteCount11.isub(mulPrecision(200));
            totalCampPoint2.isub(mulPrecision(200));
            voteCount21.isub(mulPrecision(200));

            // check pts and vote counts
            Helper.assertEqual(totalEpochPoints, await daoContract.getTotalPoints(1), "points should be correct");
            voteData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(voteData[1], totalCampPoint1, "total camp votes is incorrect");
            Helper.assertEqual(voteData[0][0], voteCount11, "option voted count is incorrect");
            Helper.assertEqual(voteData[0][1], voteCount12, "option voted count is incorrect");
            voteData = await daoContract.getCampaignVoteCountData(2);
            Helper.assertEqual(voteData[1], totalCampPoint2, "total camp votes is incorrect");
            Helper.assertEqual(voteData[0][0], voteCount21, "option voted count is incorrect");

            // delay until first camp is ended
            let data = await daoContract.getCampaignDetails(1);
            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], data[2] - currentBlock);
            data = await daoContract.getCampaignDetails(1);

            await stakingContract.withdraw(mulPrecision(100), {from: victor});

            // campaign 1 is ended, so data for camp 1 shouldn't be changed
            totalEpochPoints.isub(mulPrecision(100 * 2));
            totalCampPoint2.isub(mulPrecision(100));
            voteCount21.isub(mulPrecision(100));

            Helper.assertEqual(totalEpochPoints, await daoContract.getTotalPoints(1), "points should be correct");
            voteData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(voteData[1], totalCampPoint1, "total camp votes is incorrect");
            Helper.assertEqual(voteData[0][0], voteCount11, "option voted count is incorrect");
            Helper.assertEqual(voteData[0][1], voteCount12, "option voted count is incorrect");
            voteData = await daoContract.getCampaignVoteCountData(2);
            Helper.assertEqual(voteData[1], totalCampPoint2, "total camp votes is incorrect");
            Helper.assertEqual(voteData[0][0], voteCount21, "option voted count is incorrect");
        });
    });

    describe("#Submit Campaign tests", () => {
        it("Test submit campaign returns correct data after created", async function() {
            await deployContracts(10, currentBlock + 30, 10);

            Helper.assertEqual(0, await daoContract.networkFeeCampaign(0), "shouldn't have network fee camp");
            Helper.assertEqual(0, await daoContract.brrCampaign(0), "shouldn't have brr camp");

            let totalSupply = await kncToken.INITIAL_SUPPLY();

            for(let id = 0; id <= 2; id++) {
                Helper.assertEqual(false, await daoContract.isCampExisted(id + 1), "campaign shouldn't be existed");
                let link = web3.utils.fromAscii(id == 0 ? "" : "some_link");
                await daoContract.submitNewCampaign(
                    id, currentBlock + 2 * id + 5, currentBlock + 2 * id + 5 + minCampPeriod,
                    formulaParamsData, [1, 2, 3, 4], link, {from: admin}
                );
                Helper.assertEqual(id + 1, await daoContract.numberCampaigns(), "number campaign is incorrect");
                Helper.assertEqual(true, await daoContract.isCampExisted(id + 1), "campaign should be existed");
    
                let data = await daoContract.getCampaignDetails(id + 1);
                Helper.assertEqual(id, data[0], "campType is incorrect");
                Helper.assertEqual(currentBlock + 2 * id + 5, data[1], "start block is incorrect");
                Helper.assertEqual(currentBlock + 2 * id + 5 + minCampPeriod, data[2], "end block is incorrect");
                Helper.assertEqual(totalSupply, data[3], "total supply is incorrect");
                Helper.assertEqual(formulaParamsData, data[4], "formulaParamsData is incorrect");
                Helper.assertEqual(link, data[5].toString(), "link is incorrect");
                Helper.assertEqual(4, data[6].length, "number options is incorrect");
                Helper.assertEqual(1, data[6][0], "option value is incorrect");
                Helper.assertEqual(2, data[6][1], "option value is incorrect");
                Helper.assertEqual(3, data[6][2], "option value is incorrect");
                Helper.assertEqual(4, data[6][3], "option value is incorrect");

                let voteData = await daoContract.getCampaignVoteCountData(id + 1);
                Helper.assertEqual(4, voteData[0].length, "number options is incorrect");
                Helper.assertEqual(0, voteData[0][0], "option voted point is incorrect");
                Helper.assertEqual(0, voteData[0][1], "option voted point is incorrect");
                Helper.assertEqual(0, voteData[0][2], "option voted point is incorrect");
                Helper.assertEqual(0, voteData[0][3], "option voted point is incorrect");
                Helper.assertEqual(0, voteData[1], "total voted points is incorrect");

                let listCamps = await daoContract.getListCampIDs(0);
                Helper.assertEqual(id + 1, listCamps.length, "number camps is incorrect");

                // burn KNC to reduce total supply value
                await kncToken.burn(mulPrecision(1000000));
                totalSupply.isub(mulPrecision(1000000));
            }

            Helper.assertEqual(2, await daoContract.networkFeeCampaign(0), "should have network fee camp");
            Helper.assertEqual(3, await daoContract.brrCampaign(0), "should have brr camp");

            let listCamps = await daoContract.getListCampIDs(0);
            Helper.assertEqual(3, listCamps.length, "number camps is incorrect");
            Helper.assertEqual(1, listCamps[0], "camp id is incorrect");
            Helper.assertEqual(2, listCamps[1], "camp id is incorrect");
            Helper.assertEqual(3, listCamps[2], "camp id is incorrect");
        });

        it("Test submit campaign recored correctly network fee camp for different epoch", async function() {
            await deployContracts(15, currentBlock + 20, 3);

            let link = web3.utils.fromAscii("https://kyberswap.com");

            await daoContract.submitNewCampaign(
                1, currentBlock + 9, currentBlock + 9 + minCampPeriod,
                formulaParamsData, [1, 2, 3, 4], link, {from: admin}
            );

            Helper.assertEqual(1, await daoContract.networkFeeCampaign(0), "should have network fee camp");
            Helper.assertEqual(0, await daoContract.networkFeeCampaign(1), "shouldn't have network fee camp");

            await daoContract.submitNewCampaign(
                0, currentBlock + 9, currentBlock + 9 + minCampPeriod,
                formulaParamsData, [1, 2, 3, 4], link, {from: admin}
            );

            await daoContract.submitNewCampaign(
                2, currentBlock + 9, currentBlock + 9 + minCampPeriod,
                formulaParamsData, [1, 2, 3, 4], link, {from: admin}
            );

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock);

            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                0, currentBlock + 6, currentBlock + 6 + minCampPeriod,
                formulaParamsData, [1, 2, 3, 4], link, {from: admin}
            );
            await daoContract.submitNewCampaign(
                1, currentBlock + 6, currentBlock + 6 + minCampPeriod,
                formulaParamsData, [1, 2, 3, 4], link, {from: admin}
            );
            Helper.assertEqual(1, await daoContract.networkFeeCampaign(0), "should have network fee camp");
            Helper.assertEqual(5, await daoContract.networkFeeCampaign(1), "should have network fee camp");

            await daoContract.cancelCampaign(5, {from: admin});
            Helper.assertEqual(1, await daoContract.networkFeeCampaign(0), "should have network fee camp");
            Helper.assertEqual(0, await daoContract.networkFeeCampaign(1), "shouldn't have network fee camp");

            currentBlock = await Helper.getCurrentBlock();
            // deploy to epoch 3
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 2 * epochPeriod + startBlock - currentBlock);
            Helper.assertEqual(0, await daoContract.networkFeeCampaign(3), "shouldn't have network fee camp");
            Helper.assertEqual(0, await daoContract.networkFeeCampaign(2), "shouldn't have network fee camp");

            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                1, currentBlock + 6, currentBlock + 6 + minCampPeriod,
                formulaParamsData, [1, 2, 3, 4], link, {from: admin}
            );
            Helper.assertEqual(0, await daoContract.networkFeeCampaign(2), "shouldn't have network fee camp");
            Helper.assertEqual(6, await daoContract.networkFeeCampaign(3), "should have network fee camp");
        });

        it("Test submit campaign network fee campaign changed correctly after cancel and created new one", async function() {
            await deployContracts(50, currentBlock + 3, 10);

            // delay to epoch 1
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 3);

            Helper.assertEqual(0, await daoContract.networkFeeCampaign(1), "shouldn't have network fee camp");

            currentBlock = await Helper.getCurrentBlock();

            let link = web3.utils.fromAscii("https://kyberswap.com");

            await daoContract.submitNewCampaign(
                1, currentBlock + 10, currentBlock + 10 + minCampPeriod,
                formulaParamsData, [1, 2, 3, 4], link, {from: admin}
            );
            Helper.assertEqual(1, await daoContract.networkFeeCampaign(1), "should have network fee camp");

            await daoContract.cancelCampaign(1, {from: admin});

            Helper.assertEqual(0, await daoContract.networkFeeCampaign(1), "shouldn't have network fee camp");

            await daoContract.submitNewCampaign(
                0, currentBlock + 10, currentBlock + 10 + minCampPeriod,
                formulaParamsData, [1, 2, 3, 4], link, {from: admin}
            );
            await daoContract.submitNewCampaign(
                2, currentBlock + 10, currentBlock + 10 + minCampPeriod,
                formulaParamsData, [1, 2, 3, 4], link, {from: admin}
            );
            Helper.assertEqual(0, await daoContract.networkFeeCampaign(1), "shouldn't have network fee camp");

            await daoContract.submitNewCampaign(
                1, currentBlock + 10, currentBlock + 10 + minCampPeriod,
                formulaParamsData, [1, 2, 3, 4], link, {from: admin}
            );
            Helper.assertEqual(4, await daoContract.networkFeeCampaign(1), "should have network fee camp");
        });

        it("Test submit campaign brr campaign changed correctly after cancel and created new one", async function() {
            await deployContracts(50, currentBlock + 3, 10);

            // delay to epoch 1
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 3);

            Helper.assertEqual(0, await daoContract.brrCampaign(1), "shouldn't have brr camp");

            currentBlock = await Helper.getCurrentBlock();

            let link = web3.utils.fromAscii("https://kyberswap.com");

            await daoContract.submitNewCampaign(
                2, currentBlock + 10, currentBlock + 10 + minCampPeriod,
                formulaParamsData, [1, 2, 3, 4], link, {from: admin}
            );
            Helper.assertEqual(1, await daoContract.brrCampaign(1), "should have brr camp");

            await daoContract.cancelCampaign(1, {from: admin});

            Helper.assertEqual(0, await daoContract.brrCampaign(1), "shouldn't have brr camp");

            await daoContract.submitNewCampaign(
                0, currentBlock + 10, currentBlock + 10 + minCampPeriod,
                formulaParamsData, [1, 2, 3, 4], link, {from: admin}
            );
            await daoContract.submitNewCampaign(
                1, currentBlock + 10, currentBlock + 10 + minCampPeriod,
                formulaParamsData, [1, 2, 3, 4], link, {from: admin}
            );
            Helper.assertEqual(0, await daoContract.brrCampaign(1), "shouldn't have brr camp");

            await daoContract.submitNewCampaign(
                2, currentBlock + 10, currentBlock + 10 + minCampPeriod,
                formulaParamsData, [1, 2, 3, 4], link, {from: admin}
            );
            Helper.assertEqual(4, await daoContract.brrCampaign(1), "shouldn't have brr camp");
        });

        it("Test submit campaign recored correctly brr camp for different epoch", async function() {
            await deployContracts(15, currentBlock + 20, 3);

            let link = web3.utils.fromAscii("https://kyberswap.com");

            await daoContract.submitNewCampaign(
                2, currentBlock + 9, currentBlock + 9 + minCampPeriod,
                formulaParamsData, [1, 2, 3, 4], link, {from: admin}
            );

            Helper.assertEqual(1, await daoContract.brrCampaign(0), "should have brr camp");
            Helper.assertEqual(0, await daoContract.brrCampaign(1), "shouldn't have brr camp");

            await daoContract.submitNewCampaign(
                0, currentBlock + 9, currentBlock + 9 + minCampPeriod,
                formulaParamsData, [1, 2, 3, 4], link, {from: admin}
            );

            await daoContract.submitNewCampaign(
                1, currentBlock + 9, currentBlock + 9 + minCampPeriod,
                formulaParamsData, [1, 2, 3, 4], link, {from: admin}
            );

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock);

            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                0, currentBlock + 6, currentBlock + 6 + minCampPeriod,
                formulaParamsData, [1, 2, 3, 4], link, {from: admin}
            );
            await daoContract.submitNewCampaign(
                2, currentBlock + 6, currentBlock + 6 + minCampPeriod,
                formulaParamsData, [1, 2, 3, 4], link, {from: admin}
            );
            Helper.assertEqual(1, await daoContract.brrCampaign(0), "should have brr camp");
            Helper.assertEqual(5, await daoContract.brrCampaign(1), "should have brr camp");

            await daoContract.cancelCampaign(5, {from: admin});
            Helper.assertEqual(1, await daoContract.brrCampaign(0), "should have brr camp");
            Helper.assertEqual(0, await daoContract.brrCampaign(1), "shouldn't have brr camp");

            currentBlock = await Helper.getCurrentBlock();
            // deploy to epoch 3
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 2 * epochPeriod + startBlock - currentBlock);

            Helper.assertEqual(0, await daoContract.brrCampaign(2), "shouldn't have brr camp");
            Helper.assertEqual(0, await daoContract.brrCampaign(3), "shouldn't have brr camp");

            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                2, currentBlock + 6, currentBlock + 6 + minCampPeriod,
                formulaParamsData, [1, 2, 3, 4], link, {from: admin}
            );
            Helper.assertEqual(0, await daoContract.brrCampaign(2), "should have brr camp");
            Helper.assertEqual(6, await daoContract.brrCampaign(3), "shouldn't have brr camp");
        });

        it("Test submit campaign should revert sender is not admin", async function() {
            await deployContracts(10, currentBlock + 30, 10);
            try {
                await daoContract.submitNewCampaign(
                    0, currentBlock + 6, currentBlock + 20, formulaParamsData,
                    [1, 2, 3, 4], '0x', {from: mike}
                );
                assert(false, "throw was expected in line above.")
            } catch (e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }
            await daoContract.submitNewCampaign(
                0, currentBlock + 6, currentBlock + 20, formulaParamsData,
                [1, 2, 3, 4], '0x', {from: admin}
            );
        });

        it("Test submit campaign should revert start or end block is invalid", async function() {
            await deployContracts(30, currentBlock + 30, 10);
            // start in the past
            try {
                await daoContract.submitNewCampaign(
                    0, currentBlock - 1, currentBlock + 20, formulaParamsData,
                    [1, 2, 3, 4], '0x', {from: admin}
                );
                assert(false, "throw was expected in line above.")
            } catch (e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }
            // start in the next epoch
            try {
                await daoContract.submitNewCampaign(
                    0, currentBlock + 50, currentBlock + 70, formulaParamsData,
                    [1, 2, 3, 4], '0x', {from: admin}
                );
                assert(false, "throw was expected in line above.")
            } catch (e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }
            // start at current epoch but end in the next epoch
            try {
                await daoContract.submitNewCampaign(
                    0, currentBlock + 6, currentBlock + 30, formulaParamsData,
                    [1, 2, 3, 4], '0x', {from: admin}
                );
                assert(false, "throw was expected in line above.")
            } catch (e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }
            // start less than end
            try {
                await daoContract.submitNewCampaign(
                    0, currentBlock + 6, currentBlock + 3, formulaParamsData,
                    [1, 2, 3, 4], '0x', {from: admin}
                );
                assert(false, "throw was expected in line above.")
            } catch (e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }
            // duration is smaller than min camp duration
            try {
                await daoContract.submitNewCampaign(
                    0, currentBlock + 10, currentBlock + 10 + minCampPeriod - 2, formulaParamsData,
                    [1, 2, 3, 4], '0x', {from: admin}
                );
                assert(false, "throw was expected in line above.")
            } catch (e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }
            await daoContract.submitNewCampaign(
                0, currentBlock + 10, currentBlock + 10 + minCampPeriod - 1, formulaParamsData,
                [1, 2, 3, 4], '0x', {from: admin}
            );
        });

        it("Test submit campaign should revert number options is invalid", async function() {
            await deployContracts(30, currentBlock + 30, 10);
            // no options
            try {
                await daoContract.submitNewCampaign(
                    0, currentBlock + 3, currentBlock + 3 + minCampPeriod, formulaParamsData,
                    [], '0x', {from: admin}
                );
                assert(false, "throw was expected in line above.")
            } catch (e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }
            // one options
            try {
                await daoContract.submitNewCampaign(
                    0, currentBlock + 5, currentBlock + 5 + minCampPeriod, formulaParamsData,
                    [1], '0x', {from: admin}
                );
                assert(false, "throw was expected in line above.")
            } catch (e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }
            // more than 4 options (max number options)
            try {
                await daoContract.submitNewCampaign(
                    0, currentBlock + 7, currentBlock + 7 + minCampPeriod, formulaParamsData,
                    [1, 2, 3, 4, 5], '0x', {from: admin}
                );
                assert(false, "throw was expected in line above.")
            } catch (e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }
            // should work with 2, 3, 4 options
            await daoContract.submitNewCampaign(
                0, currentBlock + 9, currentBlock + 9 + minCampPeriod - 1, formulaParamsData,
                [1, 2], '0x', {from: admin}
            );
            await daoContract.submitNewCampaign(
                0, currentBlock + 11, currentBlock + 11 + minCampPeriod - 1, formulaParamsData,
                [1, 2, 3], '0x', {from: admin}
            );
            await daoContract.submitNewCampaign(
                0, currentBlock + 13, currentBlock + 13 + minCampPeriod - 1, formulaParamsData,
                [1, 2, 3, 4], '0x', {from: admin}
            );
        });

        it("Test submit campaign should revert option value is invalid", async function() {
            await deployContracts(30, currentBlock + 50, 10);
            // general camp: option value is 0
            try {
                await daoContract.submitNewCampaign(
                    0, currentBlock + 3, currentBlock + 3 + minCampPeriod, formulaParamsData,
                    [0, 1, 2], '0x', {from: admin}
                );
                assert(false, "throw was expected in line above.")
            } catch (e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }
            try {
                await daoContract.submitNewCampaign(
                    0, currentBlock + 5, currentBlock + 5 + minCampPeriod, formulaParamsData,
                    [1, 2, 0], '0x', {from: admin}
                );
                assert(false, "throw was expected in line above.")
            } catch (e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }
            // valid option values
            await daoContract.submitNewCampaign(
                0, currentBlock + 7, currentBlock + 7 + minCampPeriod, formulaParamsData,
                [1, 2, 3], '0x', {from: admin}
            );
            // network fee: option > 100% (BPS)
            try {
                await daoContract.submitNewCampaign(
                    1, currentBlock + 9, currentBlock + 9 + minCampPeriod, formulaParamsData,
                    [1, 2, 3, 10001], '0x', {from: admin}
                );
                assert(false, "throw was expected in line above.")
            } catch (e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }
            try {
                await daoContract.submitNewCampaign(
                    1, currentBlock + 11, currentBlock + 11 + minCampPeriod, formulaParamsData,
                    [1, 10010, 2, 3], '0x', {from: admin}
                );
                assert(false, "throw was expected in line above.")
            } catch (e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }
            await daoContract.submitNewCampaign(
                1, currentBlock + 13, currentBlock + 13 + minCampPeriod, formulaParamsData,
                [1, 10000, 2, 3], '0x', {from: admin}
            );
            // brr campaign: reward + rebate > 100%
            try {
                await daoContract.submitNewCampaign(
                    2, currentBlock + 15, currentBlock + 15 + minCampPeriod, formulaParamsData,
                    [1, getDataFromRebateAndReward(100, 10001 - 100), 2, 3], '0x', {from: admin}
                );
                assert(false, "throw was expected in line above.")
            } catch (e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }
            try {
                await daoContract.submitNewCampaign(
                    2, currentBlock + 17, currentBlock + 17 + minCampPeriod, formulaParamsData,
                    [1, 2, getDataFromRebateAndReward(20, 10000)], '0x', {from: admin}
                );
                assert(false, "throw was expected in line above.")
            } catch (e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }
            await daoContract.submitNewCampaign(
                2, currentBlock + 19, currentBlock + 19 + minCampPeriod, formulaParamsData,
                [1, getDataFromRebateAndReward(2500, 2500), 2, 3], '0x', {from: admin}
            );
        });

        it("Test submit campaign should revert invalid campaign type", async function() {
            await deployContracts(30, currentBlock + 50, 10);
            try {
                await daoContract.submitNewCampaign(
                    3, currentBlock + 3, currentBlock + 3 + minCampPeriod, formulaParamsData,
                    [1, 2, 3], '0x', {from: admin}
                );
                assert(false, "throw was expected in line above.")
            } catch (e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }
            try {
                await daoContract.submitNewCampaign(
                    5, currentBlock + 5, currentBlock + 5 + minCampPeriod, formulaParamsData,
                    [1, 2, 3], '0x', {from: admin}
                );
                assert(false, "throw was expected in line above.")
            } catch (e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }
            await daoContract.submitNewCampaign(
                0, currentBlock + 7, currentBlock + 7 + minCampPeriod, formulaParamsData,
                [1, 2, 3], '0x', {from: admin}
            );
            await daoContract.submitNewCampaign(
                1, currentBlock + 9, currentBlock + 9 + minCampPeriod, formulaParamsData,
                [1, 10000, 2, 3], '0x', {from: admin}
            );
            await daoContract.submitNewCampaign(
                2, currentBlock + 11, currentBlock + 11 + minCampPeriod, formulaParamsData,
                [1, getDataFromRebateAndReward(2500, 2500), 2, 3], '0x', {from: admin}
            );
        });

        it("Test submit campaign should revert formula params are invalid", async function() {
            await deployContracts(30, currentBlock + 50, 10);
            let formula = getFormulaParamsData(precision.add(new BN(1)), cInPrecision, tInPrecision);
            // invalid min percentage (> 100%)
            try {
                await daoContract.submitNewCampaign(
                    0, currentBlock + 3, currentBlock + 3 + minCampPeriod, formula,
                    [1, 2, 3], '0x', {from: admin}
                );
                assert(false, "throw was expected in line above.")
            } catch (e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }
            formula = getFormulaParamsData(precision.sub(new BN(100)), cInPrecision, tInPrecision);
            await daoContract.submitNewCampaign(
                0, currentBlock + 5, currentBlock + 5 + minCampPeriod, formula,
                [1, 2, 3], '0x', {from: admin}
            );
            formula = getFormulaParamsData(precision, cInPrecision, tInPrecision);
            await daoContract.submitNewCampaign(
                0, currentBlock + 7, currentBlock + 7 + minCampPeriod, formula,
                [1, 2, 3], '0x', {from: admin}
            );
        });

        it("Test submit campaign should revert network fee camp's already existed", async function() {
            await deployContracts(30, currentBlock + 20, 4);
            await daoContract.submitNewCampaign(
                1, currentBlock + 4, currentBlock + 4 + minCampPeriod, formulaParamsData,
                [1, 2, 3], '0x', {from: admin}
            );
            try {
                await daoContract.submitNewCampaign(
                    1, currentBlock + 6, currentBlock + 6 + minCampPeriod, formulaParamsData,
                    [1, 2, 3], '0x', {from: admin}
                );
                assert(false, "throw was expected in line above.")
            } catch (e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }
            await daoContract.submitNewCampaign(
                0, currentBlock + 8, currentBlock + 8 + minCampPeriod, formulaParamsData,
                [1, 2, 3], '0x', {from: admin}
            );
            await daoContract.submitNewCampaign(
                2, currentBlock + 10, currentBlock + 10 + minCampPeriod, formulaParamsData,
                [1, 2, 3], '0x', {from: admin}
            );
            currentBlock = await Helper.getCurrentBlock();
            // jump to epoch 1
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock + 1);
            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                1, currentBlock + 4, currentBlock + 4 + minCampPeriod, formulaParamsData,
                [1, 2, 3], '0x', {from: admin}
            );
            try {
                await daoContract.submitNewCampaign(
                    1, currentBlock + 6, currentBlock + 6 + minCampPeriod, formulaParamsData,
                    [1, 2, 3], '0x', {from: admin}
                );
                assert(false, "throw was expected in line above.")
            } catch (e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }
            await daoContract.submitNewCampaign(
                0, currentBlock + 8, currentBlock + 8 + minCampPeriod, formulaParamsData,
                [1, 2, 3], '0x', {from: admin}
            );
        });

        it("Test submit campaign should revert brr camp's already existed", async function() {
            await deployContracts(30, currentBlock + 20, 4);
            await daoContract.submitNewCampaign(
                2, currentBlock + 4, currentBlock + 4 + minCampPeriod, formulaParamsData,
                [1, 2, 3], '0x', {from: admin}
            );
            try {
                await daoContract.submitNewCampaign(
                    2, currentBlock + 6, currentBlock + 6 + minCampPeriod, formulaParamsData,
                    [1, 2, 3], '0x', {from: admin}
                );
                assert(false, "throw was expected in line above.")
            } catch (e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }
            await daoContract.submitNewCampaign(
                0, currentBlock + 8, currentBlock + 8 + minCampPeriod, formulaParamsData,
                [1, 2, 3], '0x', {from: admin}
            );
            await daoContract.submitNewCampaign(
                1, currentBlock + 10, currentBlock + 10 + minCampPeriod, formulaParamsData,
                [1, 2, 3], '0x', {from: admin}
            );
            currentBlock = await Helper.getCurrentBlock();
            // jump to epoch 1
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock + 1);
            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                2, currentBlock + 4, currentBlock + 4 + minCampPeriod, formulaParamsData,
                [1, 2, 3], '0x', {from: admin}
            );
            try {
                await daoContract.submitNewCampaign(
                    2, currentBlock + 6, currentBlock + 6 + minCampPeriod, formulaParamsData,
                    [1, 2, 3], '0x', {from: admin}
                );
                assert(false, "throw was expected in line above.")
            } catch (e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }
            await daoContract.submitNewCampaign(
                0, currentBlock + 8, currentBlock + 8 + minCampPeriod, formulaParamsData,
                [1, 2, 3], '0x', {from: admin}
            );
        });

        it("Test submit campaign should revert exceed max campaigns for each epoch", async function() {
            await deployContracts(2, currentBlock + 50, 4);
            let maxCamps = await daoContract.MAX_EPOCH_CAMPS();
            
            for(let id = 0; id < maxCamps; id++) {
                await daoContract.submitNewCampaign(
                    id <= 2 ? id : 0, currentBlock + 40, currentBlock + 40 + minCampPeriod, 
                    formulaParamsData, [1, 2, 3], '0x', {from: admin}
                );
            }

            try {
                await daoContract.submitNewCampaign(
                    0, currentBlock + 40, currentBlock + 40 + minCampPeriod, formulaParamsData,
                    [1, 2, 3], '0x', {from: admin}
                );
                assert(false, "throw was expected in line above.")
            } catch (e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }

            await daoContract.cancelCampaign(1, {from: admin});

            await daoContract.submitNewCampaign(
                0, currentBlock + 40, currentBlock + 40 + minCampPeriod, formulaParamsData,
                [1, 2, 3], '0x', {from: admin}
            );

            try {
                await daoContract.submitNewCampaign(
                    0, currentBlock + 40, currentBlock + 40 + minCampPeriod, formulaParamsData,
                    [1, 2, 3], '0x', {from: admin}
                );
                assert(false, "throw was expected in line above.")
            } catch (e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }
        });
    });

    describe("#Cancel Campaign tests", () => {
        it("Test cancel campaign should revert campaign is not existed", async function() {
            await deployContracts(10, currentBlock + 20, 2);
            try {
                await daoContract.cancelCampaign(1, {from: admin});
                assert(false, "throw was expected in line above.")
            } catch (e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }
            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                0, currentBlock + 5, currentBlock + 5 + minCampPeriod, formulaParamsData,
                [1, 2, 3], '0x', {from: admin}
            );
            try {
                await daoContract.cancelCampaign(2, {from: admin});
                assert(false, "throw was expected in line above.")
            } catch (e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }
            await daoContract.cancelCampaign(1, {from: admin});
        });

        it("Test cancel campaign should revert sender is not admin", async function() {
            await deployContracts(10, currentBlock + 20, 2);
            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                0, currentBlock + 5, currentBlock + 5 + minCampPeriod, formulaParamsData,
                [1, 2, 3], '0x', {from: admin}
            );
            try {
                await daoContract.cancelCampaign(1, {from: mike});
                assert(false, "throw was expected in line above.")
            } catch (e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }
            await daoContract.cancelCampaign(1, {from: admin});
        })

        it("Test cancel campaign should revert camp already started or ended", async function() {
            await deployContracts(10, currentBlock + 20, 5);
            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                0, currentBlock + 2, currentBlock + 2 + minCampPeriod, formulaParamsData,
                [1, 2, 3], '0x', {from: admin}
            );
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 2);
            // camp already running, can not cancel
            try {
                await daoContract.cancelCampaign(1, {from: admin});
                assert(false, "throw was expected in line above.")
            } catch (e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 10);
            // camp already ended, cancel cancel
            try {
                await daoContract.cancelCampaign(1, {from: admin});
                assert(false, "throw was expected in line above.")
            } catch (e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }
        })

        it("Test cancel campaign should update correct data after cancelled", async function() {
            await deployContracts(20, currentBlock + 20, 3);

            let campCounts = 0;

            for(let id = 0; id < 2; id++) {
                currentBlock = await Helper.getCurrentBlock();
                await daoContract.submitNewCampaign(
                    0, currentBlock + 10, currentBlock + 10 + minCampPeriod, formulaParamsData,
                    [1, 2, 3], '0x', {from: admin}
                );
                await daoContract.submitNewCampaign(
                    1, currentBlock + 10, currentBlock + 10 + minCampPeriod, formulaParamsData,
                    [1, 2, 3], '0x', {from: admin}
                );
                await daoContract.submitNewCampaign(
                    2, currentBlock + 10, currentBlock + 10 + minCampPeriod, formulaParamsData,
                    [1, 2, 3], '0x', {from: admin}
                );
                await daoContract.submitNewCampaign(
                    0, currentBlock + 10, currentBlock + 10 + minCampPeriod, formulaParamsData,
                    [1, 2, 3], '0x', {from: admin}
                );

                campCounts += 4;

                Helper.assertEqual(await daoContract.numberCampaigns(), campCounts, "number campaigns have been created is incorrect");

                let listCamps = await daoContract.getListCampIDs(id);

                Helper.assertEqual(listCamps.length, 4, "number camps for this epoch is incorrect");
                Helper.assertEqual(listCamps[0], campCounts - 3, "camp id for this epoch is incorrect");
                Helper.assertEqual(listCamps[1], campCounts - 2, "camp id for this epoch is incorrect");
                Helper.assertEqual(listCamps[2], campCounts - 1, "camp id for this epoch is incorrect");
                Helper.assertEqual(listCamps[3], campCounts, "camp id for this epoch is incorrect");

                // cancel last created camp
                await daoContract.cancelCampaign(campCounts, {from: admin});

                listCamps = await daoContract.getListCampIDs(id);
                Helper.assertEqual(listCamps.length, 3, "number camps for this epoch is incorrect");
                Helper.assertEqual(listCamps[0], campCounts - 3, "camp id for this epoch is incorrect");
                Helper.assertEqual(listCamps[1], campCounts - 2, "camp id for this epoch is incorrect");
                Helper.assertEqual(listCamps[2], campCounts - 1, "camp id for this epoch is incorrect");

                Helper.assertEqual(false, await daoContract.isCampExisted(campCounts), "camp shouldn't be existed after cancel");

                let campData = await daoContract.getCampaignDetails(campCounts);
                Helper.assertEqual(campData[0], 0, "camp details should be deleted");
                Helper.assertEqual(campData[1], 0, "camp details should be deleted");
                Helper.assertEqual(campData[2], 0, "camp details should be deleted");
                Helper.assertEqual(campData[3], 0, "camp details should be deleted");
                Helper.assertEqual(campData[4], 0, "camp details should be deleted");

                let voteData = await daoContract.getCampaignVoteCountData(campCounts);
                Helper.assertEqual(voteData[0].length, 0, "camp vote data should be deleted");
                Helper.assertEqual(voteData[1], 0, "camp vote data be deleted");

                // numberCampaigns value shouldn't be changed
                Helper.assertEqual(await daoContract.numberCampaigns(), campCounts, "number campaigns have been created is incorrect");

                // cancel middle camp
                await daoContract.cancelCampaign(campCounts - 3, {from: admin});

                listCamps = await daoContract.getListCampIDs(id);
                Helper.assertEqual(listCamps.length, 2, "number camps for this epoch is incorrect");
                Helper.assertEqual(listCamps[0], campCounts - 1, "camp id for this epoch is incorrect");
                Helper.assertEqual(listCamps[1], campCounts - 2, "camp id for this epoch is incorrect");

                campData = await daoContract.getCampaignDetails(campCounts - 3);
                Helper.assertEqual(campData[0], 0, "camp details should be deleted");
                Helper.assertEqual(campData[1], 0, "camp details should be deleted");
                Helper.assertEqual(campData[2], 0, "camp details should be deleted");
                Helper.assertEqual(campData[3], 0, "camp details should be deleted");
                Helper.assertEqual(campData[4], 0, "camp details should be deleted");

                voteData = await daoContract.getCampaignVoteCountData(campCounts - 3);
                Helper.assertEqual(voteData[0].length, 0, "camp vote data should be deleted");
                Helper.assertEqual(voteData[1], 0, "camp vote data be deleted");

                Helper.assertEqual(false, await daoContract.isCampExisted(campCounts - 3), "camp shouldn't be existed after cancel");

                // numberCampaigns value shouldn't be changed
                Helper.assertEqual(await daoContract.numberCampaigns(), campCounts, "number campaigns have been created is incorrect");

                await daoContract.submitNewCampaign(
                    0, currentBlock + 10, currentBlock + 10 + minCampPeriod, formulaParamsData,
                    [1, 2, 3], '0x', {from: admin}
                );

                campCounts++;

                Helper.assertEqual(await daoContract.numberCampaigns(), campCounts, "number campaigns have been created is incorrect");

                listCamps = await daoContract.getListCampIDs(id);

                Helper.assertEqual(listCamps.length, 3, "number camps for this epoch is incorrect");
                Helper.assertEqual(listCamps[0], campCounts - 2, "camp id for this epoch is incorrect");
                Helper.assertEqual(listCamps[1], campCounts - 3, "camp id for this epoch is incorrect");
                Helper.assertEqual(listCamps[2], campCounts, "camp id for this epoch is incorrect");

                // delay until new epoch
                currentBlock = await Helper.getCurrentBlock();
                await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], id * epochPeriod + startBlock - currentBlock);
            }
        });

        it("Test cancel campaign correctly for network fee camp", async function() {
            await deployContracts(20, currentBlock + 50, 5);

            Helper.assertEqual(0, await daoContract.networkFeeCampaign(0), "network fee camp id should be correct");

            let link = web3.utils.fromAscii("https://kyberswap.com");
            let formula = formulaParamsData;
            await daoContract.submitNewCampaign(
                1, currentBlock + 15, currentBlock + 15 + minCampPeriod,
                formula, [1, 2, 3], link, {from: admin}
            );

            Helper.assertEqual(1, await daoContract.networkFeeCampaign(0), "network fee camp id should be correct");

            let campData = await daoContract.getCampaignDetails(1);
            Helper.assertEqual(campData[0], 1, "camp details should be correct");
            Helper.assertEqual(campData[1], currentBlock + 15, "camp details should be correct");
            Helper.assertEqual(campData[2], currentBlock + 15 + minCampPeriod, "camp details should be correct");
            Helper.assertEqual(campData[3], await kncToken.totalSupply(), "camp details should be correct");
            Helper.assertEqual(campData[4], formula, "camp details should be correct");
            Helper.assertEqual(campData[5], link, "camp details should be correct");
            Helper.assertEqual(campData[6].length, 3, "camp details should be correct");
            Helper.assertEqual(campData[6][0], 1, "camp details should be correct");
            Helper.assertEqual(campData[6][1], 2, "camp details should be correct");
            Helper.assertEqual(campData[6][2], 3, "camp details should be correct");

            await daoContract.cancelCampaign(1, {from: admin});

            campData = await daoContract.getCampaignDetails(1);
            Helper.assertEqual(campData[0], 0, "camp details should be deleted");
            Helper.assertEqual(campData[1], 0, "camp details should be deleted");
            Helper.assertEqual(campData[2], 0, "camp details should be deleted");
            Helper.assertEqual(campData[3], 0, "camp details should be deleted");
            Helper.assertEqual(campData[4], 0, "camp details should be deleted");
            Helper.assertEqual(campData[6].length, 0, "camp details should be deleted");

            Helper.assertEqual(0, await daoContract.networkFeeCampaign(0), "network fee camp id should be deleted");

            // create a general camp
            await daoContract.submitNewCampaign(
                0, currentBlock + 20, currentBlock + 20 + minCampPeriod,
                formula, [25, 50], link, {from: admin}
            );
            // create brr camp
            await daoContract.submitNewCampaign(
                2, currentBlock + 20, currentBlock + 20 + minCampPeriod,
                formula, [25, 50], link, {from: admin}
            );
            Helper.assertEqual(0, await daoContract.networkFeeCampaign(0), "network fee camp id should be deleted");

            link = web3.utils.fromAscii("https://google.com");
            formula = getFormulaParamsData(precision.div(new BN(10)), precision.div(new BN(2)), precision.div(new BN(4)));
            await kncToken.burn(mulPrecision(100));
            await daoContract.submitNewCampaign(
                1, currentBlock + 20, currentBlock + 20 + minCampPeriod,
                formula, [25, 50], link, {from: admin}
            );

            Helper.assertEqual(4, await daoContract.networkFeeCampaign(0), "network fee camp id should be correct");

            campData = await daoContract.getCampaignDetails(4);
            Helper.assertEqual(campData[0], 1, "camp details should be correct");
            Helper.assertEqual(campData[1], currentBlock + 20, "camp details should be correct");
            Helper.assertEqual(campData[2], currentBlock + 20 + minCampPeriod, "camp details should be correct");
            Helper.assertEqual(campData[3], await kncToken.totalSupply(), "camp details should be correct");
            Helper.assertEqual(campData[4], formula, "camp details should be correct");
            Helper.assertEqual(campData[5], link, "camp details should be correct");
            Helper.assertEqual(campData[6].length, 2, "camp details should be correct");
            Helper.assertEqual(campData[6][0], 25, "camp details should be correct");
            Helper.assertEqual(campData[6][1], 50, "camp details should be correct");
        });

        it("Test cancel campaign correctly for brr camp", async function() {
            await deployContracts(20, currentBlock + 50, 5);

            Helper.assertEqual(0, await daoContract.brrCampaign(0), "brr camp id should be correct");

            let link = web3.utils.fromAscii("https://kyberswap.com");
            let formula = formulaParamsData;
            await daoContract.submitNewCampaign(
                2, currentBlock + 15, currentBlock + 15 + minCampPeriod,
                formula, [1, 2, 3], link, {from: admin}
            );

            Helper.assertEqual(1, await daoContract.brrCampaign(0), "brr camp id should be correct");

            let campData = await daoContract.getCampaignDetails(1);
            Helper.assertEqual(campData[0], 2, "camp details should be correct");
            Helper.assertEqual(campData[1], currentBlock + 15, "camp details should be correct");
            Helper.assertEqual(campData[2], currentBlock + 15 + minCampPeriod, "camp details should be correct");
            Helper.assertEqual(campData[3], await kncToken.totalSupply(), "camp details should be correct");
            Helper.assertEqual(campData[4], formula, "camp details should be correct");
            Helper.assertEqual(campData[5], link, "camp details should be correct");
            Helper.assertEqual(campData[6].length, 3, "camp details should be correct");
            Helper.assertEqual(campData[6][0], 1, "camp details should be correct");
            Helper.assertEqual(campData[6][1], 2, "camp details should be correct");
            Helper.assertEqual(campData[6][2], 3, "camp details should be correct");

            await daoContract.cancelCampaign(1, {from: admin});

            campData = await daoContract.getCampaignDetails(1);
            Helper.assertEqual(campData[0], 0, "camp details should be deleted");
            Helper.assertEqual(campData[1], 0, "camp details should be deleted");
            Helper.assertEqual(campData[2], 0, "camp details should be deleted");
            Helper.assertEqual(campData[3], 0, "camp details should be deleted");
            Helper.assertEqual(campData[4], 0, "camp details should be deleted");
            Helper.assertEqual(campData[6].length, 0, "camp details should be deleted");

            Helper.assertEqual(0, await daoContract.brrCampaign(0), "brr camp id should be deleted");

            // create a general camp
            await daoContract.submitNewCampaign(
                0, currentBlock + 20, currentBlock + 20 + minCampPeriod,
                formula, [25, 50], link, {from: admin}
            );
            // create network fee camp
            await daoContract.submitNewCampaign(
                1, currentBlock + 20, currentBlock + 20 + minCampPeriod,
                formula, [25, 50], link, {from: admin}
            );
            Helper.assertEqual(0, await daoContract.brrCampaign(0), "brr camp id should be deleted");

            link = web3.utils.fromAscii("https://google.com");
            formula = getFormulaParamsData(precision.div(new BN(10)), precision.div(new BN(2)), precision.div(new BN(4)));
            await kncToken.burn(mulPrecision(100));
            await daoContract.submitNewCampaign(
                2, currentBlock + 20, currentBlock + 20 + minCampPeriod,
                formula, [25, 50], link, {from: admin}
            );

            Helper.assertEqual(4, await daoContract.brrCampaign(0), "brr camp id should be correct");

            campData = await daoContract.getCampaignDetails(4);
            Helper.assertEqual(campData[0], 2, "camp details should be correct");
            Helper.assertEqual(campData[1], currentBlock + 20, "camp details should be correct");
            Helper.assertEqual(campData[2], currentBlock + 20 + minCampPeriod, "camp details should be correct");
            Helper.assertEqual(campData[3], await kncToken.totalSupply(), "camp details should be correct");
            Helper.assertEqual(campData[4], formula, "camp details should be correct");
            Helper.assertEqual(campData[5], link, "camp details should be correct");
            Helper.assertEqual(campData[6].length, 2, "camp details should be correct");
            Helper.assertEqual(campData[6][0], 25, "camp details should be correct");
            Helper.assertEqual(campData[6][1], 50, "camp details should be correct");
        });
    });

    describe("#Vote Tests", () => {
        it("Test vote should update data correctly - without delegation", async function() {
            await deployContracts(100, currentBlock + 15, 20);
            await setupSimpleStakingData();

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock);

            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                1, currentBlock + 3, currentBlock + 3 + minCampPeriod,
                formulaParamsData, [25, 50, 100], '0x', {from: admin}
            );
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 2);

            Helper.assertEqual(0, await daoContract.getTotalPoints(1), "total epoch points should be correct");
            let campPointsData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(0, campPointsData[1], "camp total points should be correct");
            Helper.assertEqual(0, campPointsData[0][0], "option voted count is incorrect");
            Helper.assertEqual(0, campPointsData[0][1], "option voted count is incorrect");
            Helper.assertEqual(0, campPointsData[0][2], "option voted count is incorrect");

            Helper.assertEqual(0, await daoContract.getNumberVotes(victor, 1), "number votes should be correct");
            Helper.assertEqual(0, await daoContract.getNumberVotes(mike, 1), "number votes should be correct");
            Helper.assertEqual(0, await daoContract.getNumberVotes(loi, 1), "number votes should be correct");

            await daoContract.vote(1, 1, {from: victor});

            let epochPoints = new BN(0).add(initVictorStake);
            let campPoints = new BN(0).add(initVictorStake);
            let optionPoint1 = new BN(0).add(initVictorStake);

            Helper.assertEqual(epochPoints, await daoContract.getTotalPoints(1), "total epoch points should be correct");
            campPointsData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(campPoints, campPointsData[1], "camp total points should be correct");
            Helper.assertEqual(optionPoint1, campPointsData[0][0], "option voted count is incorrect");
            Helper.assertEqual(0, campPointsData[0][1], "option voted count is incorrect");
            Helper.assertEqual(0, campPointsData[0][2], "option voted count is incorrect");

            Helper.assertEqual(1, await daoContract.getNumberVotes(victor, 1), "number votes should be correct");
            Helper.assertEqual(0, await daoContract.getNumberVotes(mike, 1), "number votes should be correct");
            Helper.assertEqual(0, await daoContract.getNumberVotes(loi, 1), "number votes should be correct");

            await daoContract.vote(1, 2, {from: mike});

            epochPoints.iadd(initMikeStake);
            campPoints.iadd(initMikeStake);
            let optionPoint2 = new BN(0).add(initMikeStake);

            Helper.assertEqual(epochPoints, await daoContract.getTotalPoints(1), "total epoch points should be correct");
            campPointsData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(campPoints, campPointsData[1], "camp total points should be correct");
            Helper.assertEqual(optionPoint1, campPointsData[0][0], "option voted count is incorrect");
            Helper.assertEqual(optionPoint2, campPointsData[0][1], "option voted count is incorrect");
            Helper.assertEqual(0, campPointsData[0][2], "option voted count is incorrect");

            Helper.assertEqual(1, await daoContract.getNumberVotes(victor, 1), "number votes should be correct");
            Helper.assertEqual(1, await daoContract.getNumberVotes(mike, 1), "number votes should be correct");
            Helper.assertEqual(0, await daoContract.getNumberVotes(loi, 1), "number votes should be correct");

            await daoContract.vote(1, 1, {from: loi});

            epochPoints.iadd(initLoiStake);
            campPoints.iadd(initLoiStake);
            optionPoint1.iadd(initLoiStake);

            Helper.assertEqual(epochPoints, await daoContract.getTotalPoints(1), "total epoch points should be correct");
            campPointsData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(campPoints, campPointsData[1], "camp total points should be correct");
            Helper.assertEqual(optionPoint1, campPointsData[0][0], "option voted count is incorrect");
            Helper.assertEqual(optionPoint2, campPointsData[0][1], "option voted count is incorrect");
            Helper.assertEqual(0, campPointsData[0][2], "option voted count is incorrect");

            Helper.assertEqual(1, await daoContract.getNumberVotes(victor, 1), "number votes should be correct");
            Helper.assertEqual(1, await daoContract.getNumberVotes(mike, 1), "number votes should be correct");
            Helper.assertEqual(1, await daoContract.getNumberVotes(loi, 1), "number votes should be correct");

            await stakingContract.withdraw(mulPrecision(100), {from: loi});

            epochPoints.isub(mulPrecision(100));
            campPoints.isub(mulPrecision(100));
            optionPoint1.isub(mulPrecision(100));

            Helper.assertEqual(epochPoints, await daoContract.getTotalPoints(1), "total epoch points should be correct");
            campPointsData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(campPoints, campPointsData[1], "camp total points should be correct");
            Helper.assertEqual(optionPoint1, campPointsData[0][0], "option voted count is incorrect");
            Helper.assertEqual(optionPoint2, campPointsData[0][1], "option voted count is incorrect");
            Helper.assertEqual(0, campPointsData[0][2], "option voted count is incorrect");

            Helper.assertEqual(1, await daoContract.getNumberVotes(victor, 1), "number votes should be correct");
            Helper.assertEqual(1, await daoContract.getNumberVotes(mike, 1), "number votes should be correct");
            Helper.assertEqual(1, await daoContract.getNumberVotes(loi, 1), "number votes should be correct");

            await stakingContract.deposit(mulPrecision(100), {from: mike});
            await stakingContract.delegate(victor, {from: loi});

            // data shouldn't be changed
            Helper.assertEqual(epochPoints, await daoContract.getTotalPoints(1), "total epoch points should be correct");
            campPointsData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(campPoints, campPointsData[1], "camp total points should be correct");
            Helper.assertEqual(optionPoint1, campPointsData[0][0], "option voted count is incorrect");
            Helper.assertEqual(optionPoint2, campPointsData[0][1], "option voted count is incorrect");
            Helper.assertEqual(0, campPointsData[0][2], "option voted count is incorrect");

            Helper.assertEqual(1, await daoContract.getNumberVotes(victor, 1), "number votes should be correct");
            Helper.assertEqual(1, await daoContract.getNumberVotes(mike, 1), "number votes should be correct");
            Helper.assertEqual(1, await daoContract.getNumberVotes(loi, 1), "number votes should be correct");

            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                2, currentBlock + 3, currentBlock + 3 + minCampPeriod,
                formulaParamsData, [25, 50], '0x', {from: admin}
            );
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 2);

            await daoContract.vote(2, 1, {from: victor});

            epochPoints.iadd(initVictorStake);
            let campPoints2 = new BN(0).add(initVictorStake);
            let optionPoint21 = new BN(0).add(initVictorStake);

            Helper.assertEqual(epochPoints, await daoContract.getTotalPoints(1), "total epoch points should be correct");
            campPointsData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(campPoints, campPointsData[1], "camp total points should be correct");
            Helper.assertEqual(optionPoint1, campPointsData[0][0], "option voted count is incorrect");
            Helper.assertEqual(optionPoint2, campPointsData[0][1], "option voted count is incorrect");
            Helper.assertEqual(0, campPointsData[0][2], "option voted count is incorrect");

            campPointsData = await daoContract.getCampaignVoteCountData(2);
            Helper.assertEqual(campPoints2, campPointsData[1], "camp total points should be correct");
            Helper.assertEqual(optionPoint21, campPointsData[0][0], "option voted count is incorrect");
            Helper.assertEqual(0, campPointsData[0][1], "option voted count is incorrect");

            Helper.assertEqual(2, await daoContract.getNumberVotes(victor, 1), "number votes should be correct");
            Helper.assertEqual(1, await daoContract.getNumberVotes(mike, 1), "number votes should be correct");
            Helper.assertEqual(1, await daoContract.getNumberVotes(loi, 1), "number votes should be correct");

            await stakingContract.withdraw(mulPrecision(200), {from: victor});

            epochPoints.isub(mulPrecision(200 * 2));
            campPoints.isub(mulPrecision(200));
            optionPoint1.isub(mulPrecision(200));
            campPoints2.isub(mulPrecision(200));
            optionPoint21.isub(mulPrecision(200));

            Helper.assertEqual(epochPoints, await daoContract.getTotalPoints(1), "total epoch points should be correct");
            campPointsData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(campPoints, campPointsData[1], "camp total points should be correct");
            Helper.assertEqual(optionPoint1, campPointsData[0][0], "option voted count is incorrect");
            Helper.assertEqual(optionPoint2, campPointsData[0][1], "option voted count is incorrect");
            Helper.assertEqual(0, campPointsData[0][2], "option voted count is incorrect");

            campPointsData = await daoContract.getCampaignVoteCountData(2);
            Helper.assertEqual(campPoints2, campPointsData[1], "camp total points should be correct");
            Helper.assertEqual(optionPoint21, campPointsData[0][0], "option voted count is incorrect");
            Helper.assertEqual(0, campPointsData[0][1], "option voted count is incorrect");
        });

        it("Test vote should update data correctly when revote - without delegation", async function() {
            await deployContracts(100, currentBlock + 15, 20);
            await setupSimpleStakingData();

            currentBlock = await Helper.getCurrentBlock();
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], startBlock - currentBlock);

            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                1, currentBlock + 3, currentBlock + 3 + minCampPeriod,
                formulaParamsData, [25, 50, 100], '0x', {from: admin}
            );
            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                2, currentBlock + 4, currentBlock + 4 + minCampPeriod,
                formulaParamsData, [25, 50], '0x', {from: admin}
            );
            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 2);

            Helper.assertEqual(0, await daoContract.getTotalPoints(1), "total epoch points should be correct");
            let campPointsData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(0, campPointsData[1], "camp total points should be correct");
            Helper.assertEqual(0, campPointsData[0][0], "option voted count is incorrect");
            Helper.assertEqual(0, campPointsData[0][1], "option voted count is incorrect");
            Helper.assertEqual(0, campPointsData[0][2], "option voted count is incorrect");

            Helper.assertEqual(0, await daoContract.getNumberVotes(victor, 1), "number votes should be correct");
            Helper.assertEqual(0, await daoContract.getNumberVotes(mike, 1), "number votes should be correct");

            await daoContract.vote(1, 1, {from: victor});

            let epochPoints = new BN(0).add(initVictorStake);
            let campPoints = new BN(0).add(initVictorStake);
            let optionPoint1 = new BN(0).add(initVictorStake);

            Helper.assertEqual(epochPoints, await daoContract.getTotalPoints(1), "total epoch points should be correct");
            campPointsData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(campPoints, campPointsData[1], "camp total points should be correct");
            Helper.assertEqual(optionPoint1, campPointsData[0][0], "option voted count is incorrect");
            Helper.assertEqual(0, campPointsData[0][1], "option voted count is incorrect");
            Helper.assertEqual(0, campPointsData[0][2], "option voted count is incorrect");

            Helper.assertEqual(1, await daoContract.getNumberVotes(victor, 1), "number votes should be correct");
            Helper.assertEqual(0, await daoContract.getNumberVotes(mike, 1), "number votes should be correct");
            Helper.assertEqual(0, await daoContract.getNumberVotes(loi, 1), "number votes should be correct");

            await daoContract.vote(1, 2, {from: mike});
            await daoContract.vote(1, 2, {from: loi});

            epochPoints.iadd(initMikeStake).iadd(initLoiStake);
            campPoints.iadd(initMikeStake).iadd(initLoiStake);
            let optionPoint2 = new BN(0).add(initMikeStake).add(initLoiStake);

            Helper.assertEqual(epochPoints, await daoContract.getTotalPoints(1), "total epoch points should be correct");
            campPointsData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(campPoints, campPointsData[1], "camp total points should be correct");
            Helper.assertEqual(optionPoint1, campPointsData[0][0], "option voted count is incorrect");
            Helper.assertEqual(optionPoint2, campPointsData[0][1], "option voted count is incorrect");
            Helper.assertEqual(0, campPointsData[0][2], "option voted count is incorrect");

            Helper.assertEqual(1, await daoContract.getNumberVotes(victor, 1), "number votes should be correct");
            Helper.assertEqual(1, await daoContract.getNumberVotes(mike, 1), "number votes should be correct");
            Helper.assertEqual(1, await daoContract.getNumberVotes(loi, 1), "number votes should be correct");

            // vote the same
            await daoContract.vote(1, 2, {from: mike});

            Helper.assertEqual(epochPoints, await daoContract.getTotalPoints(1), "total epoch points should be correct");
            campPointsData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(campPoints, campPointsData[1], "camp total points should be correct");
            Helper.assertEqual(optionPoint1, campPointsData[0][0], "option voted count is incorrect");
            Helper.assertEqual(optionPoint2, campPointsData[0][1], "option voted count is incorrect");
            Helper.assertEqual(0, campPointsData[0][2], "option voted count is incorrect");

            Helper.assertEqual(1, await daoContract.getNumberVotes(victor, 1), "number votes should be correct");
            Helper.assertEqual(1, await daoContract.getNumberVotes(mike, 1), "number votes should be correct");
            Helper.assertEqual(1, await daoContract.getNumberVotes(loi, 1), "number votes should be correct");

            // revote for mike
            await daoContract.vote(1, 1, {from: mike});

            // total points + camp points shouldn't change
            // move mike's stake from op2 to op1
            optionPoint1.iadd(initMikeStake);
            optionPoint2.isub(initMikeStake);

            Helper.assertEqual(epochPoints, await daoContract.getTotalPoints(1), "total epoch points should be correct");
            campPointsData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(campPoints, campPointsData[1], "camp total points should be correct");
            Helper.assertEqual(optionPoint1, campPointsData[0][0], "option voted count is incorrect");
            Helper.assertEqual(optionPoint2, campPointsData[0][1], "option voted count is incorrect");
            Helper.assertEqual(0, campPointsData[0][2], "option voted count is incorrect");

            Helper.assertEqual(1, await daoContract.getNumberVotes(victor, 1), "number votes should be correct");
            Helper.assertEqual(1, await daoContract.getNumberVotes(mike, 1), "number votes should be correct");
            Helper.assertEqual(1, await daoContract.getNumberVotes(loi, 1), "number votes should be correct");

            await daoContract.vote(2, 1, {from: mike});
            epochPoints.iadd(initMikeStake);

            Helper.assertEqual(epochPoints, await daoContract.getTotalPoints(1), "total epoch points should be correct");
            campPointsData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(campPoints, campPointsData[1], "camp total points should be correct");
            Helper.assertEqual(optionPoint1, campPointsData[0][0], "option voted count is incorrect");
            Helper.assertEqual(optionPoint2, campPointsData[0][1], "option voted count is incorrect");
            Helper.assertEqual(0, campPointsData[0][2], "option voted count is incorrect");

            let campPoints2 = new BN(0).add(initMikeStake);
            let option1Camp2 = new BN(0).add(initMikeStake);

            campPointsData = await daoContract.getCampaignVoteCountData(2);
            Helper.assertEqual(campPoints2, campPointsData[1], "camp total points should be correct");
            Helper.assertEqual(option1Camp2, campPointsData[0][0], "option voted count is incorrect");
            Helper.assertEqual(0, campPointsData[0][1], "option voted count is incorrect");

            Helper.assertEqual(1, await daoContract.getNumberVotes(victor, 1), "number votes should be correct");
            Helper.assertEqual(2, await daoContract.getNumberVotes(mike, 1), "number votes should be correct");
            Helper.assertEqual(1, await daoContract.getNumberVotes(loi, 1), "number votes should be correct");

            await stakingContract.withdraw(mulPrecision(100), {from: mike});

            epochPoints.isub(mulPrecision(100 * 2));
            campPoints.isub(mulPrecision(100));
            optionPoint1.isub(mulPrecision(100)); // mike has change vote to option 1
            campPoints2.isub(mulPrecision(100));
            option1Camp2.isub(mulPrecision(100));

            Helper.assertEqual(epochPoints, await daoContract.getTotalPoints(1), "total epoch points should be correct");
            campPointsData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(campPoints, campPointsData[1], "camp total points should be correct");
            Helper.assertEqual(optionPoint1, campPointsData[0][0], "option voted count is incorrect");
            Helper.assertEqual(optionPoint2, campPointsData[0][1], "option voted count is incorrect");
            Helper.assertEqual(0, campPointsData[0][2], "option voted count is incorrect");

            campPointsData = await daoContract.getCampaignVoteCountData(2);
            Helper.assertEqual(campPoints2, campPointsData[1], "camp total points should be correct");
            Helper.assertEqual(option1Camp2, campPointsData[0][0], "option voted count is incorrect");
            Helper.assertEqual(0, campPointsData[0][1], "option voted count is incorrect");

            // delegate + deposit, nothing change
            await stakingContract.deposit(mulPrecision(200), {from: mike});
            await stakingContract.deposit(mulPrecision(300), {from: victor});
            await stakingContract.deposit(mulPrecision(400), {from: loi});

            await stakingContract.delegate(mike, {from: loi});
            await stakingContract.delegate(mike, {from: victor});

            // nothing should be changed here
            Helper.assertEqual(epochPoints, await daoContract.getTotalPoints(1), "total epoch points should be correct");
            campPointsData = await daoContract.getCampaignVoteCountData(1);
            Helper.assertEqual(campPoints, campPointsData[1], "camp total points should be correct");
            Helper.assertEqual(optionPoint1, campPointsData[0][0], "option voted count is incorrect");
            Helper.assertEqual(optionPoint2, campPointsData[0][1], "option voted count is incorrect");
            Helper.assertEqual(0, campPointsData[0][2], "option voted count is incorrect");

            campPointsData = await daoContract.getCampaignVoteCountData(2);
            Helper.assertEqual(campPoints2, campPointsData[1], "camp total points should be correct");
            Helper.assertEqual(option1Camp2, campPointsData[0][0], "option voted count is incorrect");
            Helper.assertEqual(0, campPointsData[0][1], "option voted count is incorrect");
        });

        it("Test vote should revert camp is not existed", async function() {
            await deployContracts(4, currentBlock + 20, 3);

            try {
                await daoContract.vote(1, 1, {from: mike});
                assert(false, "throw was expected in line above");
            } catch (e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }

            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                0, currentBlock + 3, currentBlock + 3 + minCampPeriod,
                formulaParamsData, [25, 50], '0x', {from: admin}
            );

            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 3);
            try {
                await daoContract.vote(2, 1, {from: mike});
                assert(false, "throw was expected in line above");
            } catch (e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }

            await daoContract.vote(1, 1, {from: mike});
        })

        it("Test vote should revert camp has not started or already ended", async function() {
            await deployContracts(4, currentBlock + 20, 5);

            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                0, currentBlock + 5, currentBlock + 5 + minCampPeriod,
                formulaParamsData, [25, 50], '0x', {from: admin}
            );

            // camp not started yet
            try {
                await daoContract.vote(1, 1, {from: mike});
                assert(false, "throw was expected in line above");
            } catch (e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }

            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 3);

            // can note now
            await daoContract.vote(1, 1, {from: mike});

            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], minCampPeriod);

            // camp alread ended
            try {
                await daoContract.vote(1, 1, {from: mike});
                assert(false, "throw was expected in line above");
            } catch (e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }
        })

        it("Test vote should revert when voted option is invalid", async function() {
            await deployContracts(4, currentBlock + 20, 8);

            currentBlock = await Helper.getCurrentBlock();
            await daoContract.submitNewCampaign(
                0, currentBlock + 5, currentBlock + 5 + minCampPeriod,
                formulaParamsData, [25, 50], '0x', {from: admin}
            );

            await Helper.increaseBlockNumberBySendingEther(accounts[0], accounts[0], 3);

            // can not vote for 0
            try {
                await daoContract.vote(1, 0, {from: mike});
                assert(false, "throw was expected in line above");
            } catch (e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }

            // can not vote for option that is bigger than range
            try {
                await daoContract.vote(1, 3, {from: mike});
                assert(false, "throw was expected in line above");
            } catch (e) {
                assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
            }

            // can note now
            await daoContract.vote(1, 1, {from: mike});
            await daoContract.vote(1, 2, {from: mike});
        })
    });

    describe("#Conclude Campaign Tests", () => {
    });

    describe("#Claim Reward Tests", () => {
    });

    describe("#Constructor Tests", () => {
        it("Test correct data is set after deployment", async function() {
            await deployContracts(10, currentBlock + 10, 10);

            Helper.assertEqual(await daoContract.EPOCH_PERIOD(), 10, "Epoch period is wrong");
            Helper.assertEqual(await daoContract.START_BLOCK(), currentBlock + 10, "Start block is wrong");
            Helper.assertEqual(await daoContract.KNC_TOKEN(), kncToken.address, "KNC token is wrong");
            Helper.assertEqual(await daoContract.staking(), stakingContract.address, "Staking contract is wrong");
            Helper.assertEqual(await daoContract.feeHandler(), feeHandler.address, "Feehandler contract is wrong");
            Helper.assertEqual(await daoContract.MAX_CAMP_OPTIONS(), maxCampOptions, "max camp option is wrong");
            Helper.assertEqual(await daoContract.MIN_CAMP_DURATION(), minCampPeriod, "min camp period is wrong");
            Helper.assertEqual(await daoContract.latestNetworkFeeResult(), defaultNetworkFee, "default network fee is wrong");
            Helper.assertEqual(await daoContract.latestBrrResult(), defaultBrrData, "default brr data is wrong");
            Helper.assertEqual(await daoContract.admin(), admin, "admin is wrong");
            Helper.assertEqual(await daoContract.numberCampaigns(), 0, "number campaign is wrong");
        });
    });

    describe("#Helper Function Tests", () => {
    });
});

function logInfo(message) {
    console.log("           " + message);
}

function mulPrecision(value) {
    return precision.mul(new BN(value));
}

function getDataFromRebateAndReward(rebate, reward) {
    let power128 = new BN(2).pow(new BN(128));
    return (new BN(rebate).mul(power128)).add(new BN(reward));
}

function getRebateAndRewardFromData(data) {
    let power128 = new BN(2).pow(new BN(128));
    let reward = new BN(data).mod(power128);
    let rebate = new BN(data).div(power128);
    return (reward, rebate);
}

function getFormulaParamsData(minPercentageInPrecision, cInPrecision, tInPrecision) {
    let power84 = new BN(2).pow(new BN(84));
    let data = (new BN(0)).add(minPercentageInPrecision);
    data.iadd(new BN(cInPrecision).mul(power84));
    data.iadd(new BN(tInPrecision).mul(power84).mul(power84));
    return data;
}