// Registry of every game simulation (pure JS: runs on the server and in the browser for offline bot matches).
import { AirHockeySim } from './games/airhockey.js';
import { SumoSim } from './games/sumo.js';
import { TicTacToeSim } from './games/tictactoe.js';
import { PingPongSim } from './games/pingpong.js';
import { SoccerSim } from './games/soccer.js';
import { TanksSim } from './games/tanks.js';
import { SnakesSim } from './games/snakes.js';
import { PenaltySim } from './games/penalty.js';
import { ReflexSim } from './games/reflex.js';
import { TugOfWarSim } from './games/tugofwar.js';
import { Connect4Sim } from './games/connect4.js';
import { DotsBoxesSim } from './games/dotsboxes.js';
import { MemorySim } from './games/memory.js';
import { FishingSim } from './games/fishing.js';
import { VolleySim } from './games/volley.js';
import { FrogsSim } from './games/frogs.js';
import { MolesSim } from './games/moles.js';
import { PotatoSim } from './games/potato.js';
import { BowlingSim } from './games/bowling.js';
import { DartsSim } from './games/darts.js';
import { CannonSim } from './games/cannon.js';
import { SeaBattleSim } from './games/seabattle.js';
import { RpsSim } from './games/rps.js';
import { MathTugSim } from './games/mathtug.js';
import { FoosballSim } from './games/foosball.js';
import { GeoSim } from './games/geo.js';
import { GolfSim } from './games/golf.js';
import { PoolSim } from './games/pool.js';
import { RacingSim } from './games/racing.js';
import { BomberSim } from './games/bomber.js';
import { WireSim } from './games/wire.js';
import { CodeSim } from './games/code.js';
import { PipesSim } from './games/pipes.js';
import { StroopSim } from './games/stroop.js';
import { SimonSim } from './games/simon.js';
import { MissingSim } from './games/missing.js';
import { ShadowSim } from './games/shadow.js';
import { SpotSim } from './games/spot.js';
import { StackSim } from './games/stack.js';
import { ParkingSim } from './games/parking.js';
import { HeistSim } from './games/heist.js';
import { CavitySim } from './games/cavity.js';
import { TCannonSim } from './games/tcannon.js';
import { BraceWarSim } from './games/bracewar.js';
import { BalanceSim } from './games/balance.js';
import { RecallSim } from './games/recall.js';
import { FruitSim } from './games/fruit.js';
import { PropHuntSim } from './games/prophunt.js';
import { CubeSim } from './games/cube.js';
import { JigsawSim } from './games/jigsaw.js';
import { TennisSim } from './games/tennis.js';
import { HoopsSim } from './games/hoops.js';
import { PaintSim } from './games/paint.js';
import { RunnerSim } from './games/runner.js';
import { BoxingSim } from './games/boxing.js';
import { CurlingSim } from './games/curling.js';
import { SnowballSim } from './games/snowball.js';
import { ArcherySim } from './games/archery.js';
import { ToolsSim } from './games/tools.js';
import { GiftsSim, CakeSim, BalloonSim, ChainSim, ThiefSim, PartySim } from './games/partylogic.js';

export const SIMS = {
  airhockey: AirHockeySim, sumo: SumoSim, tictactoe: TicTacToeSim, pingpong: PingPongSim, soccer: SoccerSim,
  tanks: TanksSim, snakes: SnakesSim, penalty: PenaltySim, reflex: ReflexSim, tugofwar: TugOfWarSim,
  connect4: Connect4Sim, dotsboxes: DotsBoxesSim, memory: MemorySim,
  fishing: FishingSim, volley: VolleySim, frogs: FrogsSim, moles: MolesSim, potato: PotatoSim,
  bowling: BowlingSim, darts: DartsSim, cannon: CannonSim, seabattle: SeaBattleSim, rps: RpsSim,
  mathtug: MathTugSim, foosball: FoosballSim, geo: GeoSim, golf: GolfSim, pool: PoolSim, racing: RacingSim, bomber: BomberSim,
  wire: WireSim, code: CodeSim, pipes: PipesSim, stroop: StroopSim, simon: SimonSim,
  missing: MissingSim, shadow: ShadowSim, spot: SpotSim, stack: StackSim, parking: ParkingSim,
  heist: HeistSim, cavity: CavitySim, tcannon: TCannonSim, bracewar: BraceWarSim,
  balance: BalanceSim, recall: RecallSim, gifts: GiftsSim, cake: CakeSim, balloon: BalloonSim, chain: ChainSim, thief: ThiefSim, party: PartySim,
  fruit: FruitSim, prophunt: PropHuntSim, cube: CubeSim, jigsaw: JigsawSim, tennis: TennisSim, hoops: HoopsSim, paint: PaintSim, runner: RunnerSim, boxing: BoxingSim, curling: CurlingSim, snowball: SnowballSim, archery: ArcherySim, tools: ToolsSim,
};
