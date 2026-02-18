import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from .models import Room

class GameConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        print(f"DEBUG: Connecting to {self.scope['url_route']['kwargs']['room_code']}")
        self.room_code = self.scope['url_route']['kwargs']['room_code']
        self.room_group_name = 'game_%s' % self.room_code

        try:
            # Check expiration
            try:
                room = await database_sync_to_async(Room.objects.get)(code=self.room_code)
                if room.is_expired:
                    print("DEBUG: Room expired")
                    await self.close(code=4000)
                    return
            except Room.DoesNotExist:
                print("DEBUG: Room not found")
                await self.close()
                return
            except Exception as e:
                print(f"DEBUG: Error in room check: {e}")
                import traceback
                traceback.print_exc()
                await self.close()
                return

            # Join room group
            await self.channel_layer.group_add(
                self.room_group_name,
                self.channel_name
            )

            await self.accept()
            print("DEBUG: Connection accepted")
        except Exception as e:
            print(f"DEBUG: Error in connect: {e}")
            import traceback
            traceback.print_exc()
            await self.close()

    async def disconnect(self, close_code):
        print(f"DEBUG: Disconnect with code {close_code}")
        # Leave room group
        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )

    async def receive(self, text_data):
        print(f"DEBUG: Received {text_data}")
        try:
            text_data_json = json.loads(text_data)
            message_type = text_data_json.get('type')
            
            if message_type == 'join_game':
                await self.join_game(text_data_json)
            elif message_type == 'make_move':
                await self.make_move(text_data_json)
            elif message_type == 'roll_dice':
                await self.roll_dice(text_data_json)
            elif message_type == 'reset_game':
                await self.reset_game(text_data_json)
        except Exception as e:
            print(f"DEBUG: Error in receive: {e}")
            import traceback
            traceback.print_exc()

    async def join_game(self, data):
        side = await self.assign_player_side()
        await self.send(text_data=json.dumps({
            'type': 'game_start',
            'side': side,
            'game_state': await self.get_game_state()
        }))
        await self.channel_layer.group_send(
            self.room_group_name,
            {'type': 'game_update', 'game_state': await self.get_game_state()}
        )

    async def make_move(self, data):
        index = data.get('index')
        player = data.get('player')
        if await self.update_game_state(index, player):
            await self.channel_layer.group_send(
                self.room_group_name,
                {'type': 'game_update', 'game_state': await self.get_game_state()}
            )

    async def roll_dice(self, data):
        player = data.get('player')
        # Simple dice logic for now
        import random
        dice_value = random.randint(1, 6)
        
        if await self.update_dice_state(player, dice_value):
            await self.channel_layer.group_send(
                self.room_group_name,
                {'type': 'game_update', 'game_state': await self.get_game_state()}
            )

    async def reset_game(self, data):
        if await self.reset_game_state():
            await self.channel_layer.group_send(
                self.room_group_name,
                {'type': 'game_update', 'game_state': await self.get_game_state()}
            )

    async def game_update(self, event):
        await self.send(text_data=json.dumps({
            'type': 'game_update',
            'game_state': event['game_state']
        }))

    @database_sync_to_async
    def get_game_state(self):
        room = Room.objects.get(code=self.room_code)
        return room.game_state

    @database_sync_to_async
    def assign_player_side(self):
        room = Room.objects.get(code=self.room_code)
        state = room.game_state
        players = state.get('players', {})
        player_id = self.scope['session'].session_key or self.channel_name
        player_name = self.scope['session'].get('player_name', 'Unknown Player')
        
        if player_id in players:
            players[player_id]['name'] = player_name
            room.game_state = state
            room.save()
            return players[player_id]['side']
        
        # Assign logic
        if room.game_type == 'TIC_TAC_TOE':
            if 'X' not in [p['side'] for p in players.values()]: side = 'X'
            elif 'O' not in [p['side'] for p in players.values()]: side = 'O'
            else: side = 'SPECTATOR'
        elif room.game_type == 'LUDO':
            colors = ['RED', 'GREEN', 'YELLOW', 'BLUE']
            taken = [p['side'] for p in players.values()]
            available = [c for c in colors if c not in taken]
            side = available[0] if available else 'SPECTATOR'
        else:
            side = 'SPECTATOR'

        players[player_id] = {'side': side, 'name': player_name, 'score': 0}
        room.save()
        return side

    @database_sync_to_async
    def update_game_state(self, index, player):
        room = Room.objects.get(code=self.room_code)
        state = room.game_state
        
        if room.game_type == 'TIC_TAC_TOE':
            if state.get('game_over', False) or state['board'][index] is not None or state['turn'] != player:
                return False
            
            state['board'][index] = player
            
            # Check Winner
            if self.check_winner(state['board'], player):
                state['winner'] = player # Stores 'X' or 'O'
                state['game_over'] = True
                # Update Score
                winner_name = player
                for pid, pdata in state['players'].items():
                    if pdata['side'] == player:
                        pdata['score'] = pdata.get('score', 0) + 1
                        winner_name = pdata['name'] # Store name for display if needed
                state['winner_name'] = winner_name
            elif None not in state['board']:
                state['winner'] = 'Draw'
                state['game_over'] = True
            else:
                state['turn'] = 'O' if player == 'X' else 'X'
                
            room.game_state = state
            room.save()
            return True
        return False

    @database_sync_to_async
    def update_dice_state(self, player, value):
        room = Room.objects.get(code=self.room_code)
        state = room.game_state
        if room.game_type == 'LUDO':
            if state['turn'] != player:
                return False
            state['dice_value'] = value
            # Simple turn switching for now (real rules usually wait for move)
            # For this step, let's just rotate turn to show interactivity
            colors = ['RED', 'GREEN', 'YELLOW', 'BLUE']
            try:
                current_idx = colors.index(player)
                next_idx = (current_idx + 1) % 4
                state['turn'] = colors[next_idx]
            except ValueError:
                pass
            room.save()
            return True
        return False

    @database_sync_to_async
    def reset_game_state(self):
        room = Room.objects.get(code=self.room_code)
        state = room.game_state
        if room.game_type == 'TIC_TAC_TOE':
            state['board'] = [None] * 9
            state['winner'] = None
            state['game_over'] = False
            state['turn'] = 'X'
        elif room.game_type == 'LUDO':
            state['winner'] = None
            state['dice_value'] = 0
            state['turn'] = 'RED'
        room.save()
        return True

    def check_winner(self, board, player):
        win_conditions = [
            (0, 1, 2), (3, 4, 5), (6, 7, 8),
            (0, 3, 6), (1, 4, 7), (2, 5, 8),
            (0, 4, 8), (2, 4, 6)
        ]
        return any(all(board[i] == player for i in condition) for condition in win_conditions)
