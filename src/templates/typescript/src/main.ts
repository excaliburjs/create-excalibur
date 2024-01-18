import './style.css';
import { DevTool } from '@excaliburjs/dev-tools';
import { breakout_game } from './sample/breakout';

//
if (false) new DevTool(breakout_game.game);

breakout_game.start();
