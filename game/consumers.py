import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from .models import Room, ChatLog

class GameConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.room_code = self.scope['url_route']['kwargs']['room_code']
        self.room_group_name = f'game_{self.room_code}'
        
        # Diagnostic Log
        print(f"DEBUG: Connecting to room {self.room_code}. Channel Layer: {self.channel_layer}")

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
            elif message_type == 'chat_message':
                await self.chat_message(text_data_json)
            elif message_type == 'search_stickers':
                await self.search_stickers(text_data_json)
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
        
        # Check if it's bot turn
        await self.trigger_bot_if_needed()

    async def make_move(self, data):
        index = data.get('index')
        player = data.get('player')
        success, error_msg = await self.update_game_state(index, player)
        
        if success:
            await self.channel_layer.group_send(
                self.room_group_name,
                {'type': 'game_update', 'game_state': await self.get_game_state()}
            )
            
            # Check for bot
            await self.trigger_bot_if_needed()
        elif error_msg:
            # Send error only to the player who made the move
            await self.send(text_data=json.dumps({
                'type': 'error',
                'message': error_msg
            }))

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
            
            # Check for Auto-Pass
            state = await self.get_game_state()
            if state.get('phase') == 'AUTO_PASS':
                import asyncio
                asyncio.create_task(self.delayed_pass(self.room_code))
            else:
                 # If user rolled 6, they might get another turn, but it's still their turn.
                 # If somehow turn changed (not possible in roll unless auto-pass), check bot.
                 if state['turn'] != player:
                     await self.trigger_bot_if_needed()


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

    async def chat_message(self, data):
        message = data.get('message')
        sender = data.get('sender', 'Anonymous')
        
        # Broadcast to room
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'chat_broadcast',
                'message': message,
                'sender': sender
            }
        )

        # Save to database
        await self.save_chat_message(sender, message)

        # AI Agent Trigger
        if message and message.lower().startswith('@ai'):
             import asyncio
             asyncio.create_task(self.handle_ai_command(message))

    async def chat_broadcast(self, event):
        # Send message to WebSocket
        await self.send(text_data=json.dumps({
            'type': 'chat_message',
            'message': event['message'],
            'sender': event['sender']
        }))

    async def handle_ai_command(self, message):
        import aiohttp
        import random
        
        cmd = message.lower().strip()
        response_msg = ""
        sender_name = "LudoBot 🤖"
        
        try:
            async with aiohttp.ClientSession() as session:
                if "meme" in cmd:
                    # Fetch meme
                    url = "https://meme-api.com/gimme"
                    async with session.get(url) as response:
                        if response.status == 200:
                            data = await response.json()
                            response_msg = data.get('url', 'Could not fetch meme :(')
                
                elif "sticker" in cmd or "cat" in cmd:
                    if "cat" in cmd:
                         # simplified: just use the image url pattern with a random cachebuster
                         response_msg = f"https://cataas.com/cat?t={random.randint(1,1000)}"
                    else:
                        # Generic sticker from robohash
                        seed = random.randint(1, 1000)
                        response_msg = f"https://robohash.org/{seed}.png?set=set2&size=200x200"
                
                else:
                    response_msg = "I can send you a 'meme' or a 'sticker' (try '@ai meme' or '@ai sticker')"
            
            # Send AI Response
            if response_msg:
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        'type': 'chat_broadcast',
                        'message': response_msg,
                        'sender': sender_name
                    }
                )
                # Save AI response to database
                await self.save_chat_message(sender_name, response_msg)
        except Exception as e:
            print(f"AI Error: {e}")
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'chat_broadcast',
                    'message': "My brain is offline 😵",
                    'sender': sender_name
                }
            )

    async def search_stickers(self, data):
        query = data.get('query', '').lower().strip()
        results = []
        
        # 1. Add some static/generative matches
        import random
        
        # Robohash (Monster/Robot/Head)
        results.append(f"https://robohash.org/{query}.png?set=set2&size=150x150")
        results.append(f"https://robohash.org/{query}.png?set=set1&size=150x150")
        
        # LoremFlickr (Real Images) - use random lock to get different images
        # Note: LoremFlickr might be slow, but it's free.
        # Add timestamp to bypass cache
        results.append(f"https://loremflickr.com/150/150/{query}?lock={random.randint(1,1000)}")
        results.append(f"https://loremflickr.com/150/150/{query}?lock={random.randint(1,1000)}")
        
        # Send results back to requester ONLY (not broadcast)
        await self.send(text_data=json.dumps({
            'type': 'sticker_search_results',
            'results': results
        }))

    @database_sync_to_async
    def get_game_state(self):
        room = Room.objects.get(code=self.room_code)
        return room.game_state

    @database_sync_to_async
    def save_chat_message(self, sender, message):
        try:
            room = Room.objects.get(code=self.room_code)
            ChatLog.objects.create(
                room=room,
                sender=sender,
                message=message
            )
            print(f"DEBUG: Chat saved: {sender}: {message[:20]}")
        except Exception as e:
            print(f"DEBUG: Error saving chat: {e}")

    @database_sync_to_async
    def assign_player_side(self):
        room = Room.objects.get(code=self.room_code)
        state = room.game_state
        if 'players' not in state:
            state['players'] = {}
        players = state['players']
        
        player_id = self.scope['session'].session_key or self.channel_name
        player_name = self.scope['session'].get('player_name', 'Unknown Player')
        
        if player_id in players:
            players[player_id]['name'] = player_name
            room.game_state = state
            room.save()
            return players[player_id]['side']
        
        # Assign logic
        side = 'SPECTATOR' # Default side
        if room.game_type == 'TIC_TAC_TOE':
            taken_sides = [p['side'] for p in players.values()]
            if 'X' not in taken_sides: side = 'X'
            elif 'O' not in taken_sides: side = 'O'
            else: side = 'SPECTATOR'
            players[player_id] = {'side': side, 'name': player_name, 'score': 0}

        elif room.game_type == 'LUDO':
            # 8-Player Support
            base_colors = ['RED', 'GREEN', 'YELLOW', 'BLUE', 'ORANGE', 'PURPLE', 'CYAN', 'PINK']
            colors = base_colors[:room.player_count] if room.player_count > 4 else base_colors[:4]
            
            if room.mode == 'COMPUTER':
                is_user_active = any(not p.get('is_bot') for p in players.values())
                if not is_user_active:
                    side = 'RED'
                    to_remove = [k for k, p in players.items() if p['side'] == 'RED' and not p.get('is_bot')]
                    for k in to_remove: del players[k]

                    players[player_id] = {
                        'side': side, 'name': player_name, 
                        'pieces': [-1, -1, -1, -1], 'finished_pieces': 0, 'is_bot': False
                    }
                    
                    count = room.player_count
                    bot_colors = colors[1:count] 
                    for b_color in bot_colors:
                        bot_key = f'bot_{b_color}'
                        if bot_key not in players:
                             players[bot_key] = {
                                'side': b_color, 'name': 'Computer', 
                                'pieces': [-1, -1, -1, -1], 'finished_pieces': 0, 'is_bot': True
                            }
                    room.game_state = state
                    room.save()
                    return side
                else:
                    if player_id in players:
                        return players[player_id]['side']
                    return 'SPECTATOR' 

            elif room.mode == 'LOCAL':
                if not players:
                     count = room.player_count
                     active_colors = colors[:count]
                     for c in active_colors:
                         players[f'local_{c}'] = {
                            'side': c, 'name': f'Player {c}', 
                            'pieces': [-1, -1, -1, -1], 'finished_pieces': 0, 'is_bot': False, 'is_local': True
                        }
                     players[player_id] = {'side': 'CONTROLLER', 'name': player_name}
                room.game_state = state
                room.save()
                return 'CONTROLLER'

            # ONLINE (Default)
            taken = [p['side'] for p in players.values()]
            available = [c for c in colors if c not in taken]
            side = available[0] if available else 'SPECTATOR'
            players[player_id] = {
                'side': side, 
                'name': player_name, 
                'pieces': [-1, -1, -1, -1],
                'finished_pieces': 0,
                'is_bot': False
            }
        
        elif room.game_type == 'SNAKES_AND_LADDERS':
            colors = ['RED', 'GREEN', 'YELLOW', 'BLUE']
            taken = [p['side'] for p in players.values()]
            available = [c for c in colors if c not in taken]
            side = available[0] if available else 'SPECTATOR'
            players[player_id] = {
                'side': side,
                'name': player_name,
                'pos': 0, # 0 to 100
            }
        
        room.game_state = state
        room.save()
        return side

    @database_sync_to_async
    def update_game_state(self, index, player):
        room = Room.objects.get(code=self.room_code)
        state = room.game_state
        
        if room.game_type == 'TIC_TAC_TOE':
             if state.get('game_over', False) or state['board'][index] is not None or state['turn'] != player:
                return False, "Invalid move or not your turn"
             state['board'][index] = player
             if self.check_winner(state['board'], player):
                state['winner'] = player
                state['game_over'] = True
             elif None not in state['board']:
                state['winner'] = 'Draw'
                state['game_over'] = True
             else:
                state['turn'] = 'O' if player == 'X' else 'X'
             room.save()
             return True, None

        elif room.game_type == 'LUDO':
            if state['turn'] != player or state.get('phase') != 'MOVE':
                return False, "Not your turn or wait for roll!"
            
            piece_idx = index # 0-3
            dice_val = state['dice_value']
            
            # Find player
            p_key = None
            p_data = None
            for k, p in state['players'].items():
                if p['side'] == player:
                    p_key = k
                    p_data = p
                    break
            
            if not p_data: return False, "Player data not found"
            
            current_pos = p_data['pieces'][piece_idx]
            
            # Move Logic
            new_pos = -1
            
            if current_pos == -1:
                if dice_val == 6:
                    new_pos = 0 # Move to start
                else:
                    return False, "Need a 6 to start!"
            elif current_pos == 57:
                return False, "Piece already finished"
            else:
                if current_pos + dice_val > 57:
                    return False, "Move exceeds home"
                new_pos = current_pos + dice_val
            
            # Execute Move
            p_data['pieces'][piece_idx] = new_pos
            
            # Final position
            if new_pos == 57:
                p_data['finished_pieces'] += 1
                if p_data['finished_pieces'] == 4:
                    state['winner'] = player
            
            # Capture logic
            capture = False
            if new_pos != -1 and new_pos < 52:
                capture = self.check_collision(state, player, new_pos)
            
            # Next Turn if not a six and no capture
            if dice_val != 6 and not capture:
                self.next_turn(state)
            else:
                state['phase'] = 'ROLL' # Roll again
            
            room.game_state = state
            room.save()
            return True, None

        elif room.game_type == 'SNAKES_AND_LADDERS':
            if state['turn'] != player or state.get('phase') != 'MOVE':
                return False, "Not your turn or wait for roll!"
            
            dice_val = state['dice_value']
            
            # Find player
            p_data = None
            for p in state['players'].values():
                if p['side'] == player:
                    p_data = p
                    break
            
            if not p_data: return False, "Player data not found"
            
            old_pos = p_data['pos']
            if old_pos + dice_val > 100:
                # Can't move, just next turn
                self.next_turn_sl(state)
            else:
                new_pos = old_pos + dice_val
                
                # Snakes and Ladders Map
                # Ladders: 4->14, 9->31, 20->38, 28->84, 40->59, 51->67, 63->81, 71->91
                # Snakes: 17->7, 54->34, 62->19, 64->60, 87->24, 93->73, 95->75, 99->78
                sl_map = {
                    4: 14, 9: 31, 20: 38, 28: 84, 40: 59, 51: 67, 63: 81, 71: 91, # Ladders
                    17: 7, 54: 34, 62: 19, 64: 60, 87: 24, 93: 73, 95: 75, 99: 78 # Snakes
                }
                
                if new_pos in sl_map:
                    new_pos = sl_map[new_pos]
                
                p_data['pos'] = new_pos
                
                if new_pos == 100:
                    state['winner'] = player
                
                self.next_turn_sl(state)
            
            room.game_state = state
            room.save()
            return True, None
        return False, "Unknown game type"

    def check_collision(self, state, player_color, piece_pos):
        # Determine Board Configuration
        # If we have any of the extended colors, use 8-player logic
        extended_colors = ['ORANGE', 'PURPLE', 'CYAN', 'PINK']
        is_8_player = any(p['side'] in extended_colors for p in state['players'].values()) or len(state['players']) > 4
        
        if is_8_player:
            total_steps = 104
            segment_size = 13
            # Order: RED, GREEN, YELLOW, BLUE, ORANGE, PURPLE, CYAN, PINK
            # Wait, turn order in 'next_turn' must match offset order.
            # Let's define a strict order for calculations
            order = ['RED', 'GREEN', 'YELLOW', 'BLUE', 'ORANGE', 'PURPLE', 'CYAN', 'PINK']
            offsets = {c: i * segment_size for i, c in enumerate(order)}
            
            # Safe spots (Standard Ludo: Start + Star) -> index 0 and 8 relative to start
            # Global Safe Indices
            safe_indices = []
            for i in range(8):
                base = i * segment_size
                safe_indices.append(base) # Start
                safe_indices.append((base + 8) % total_steps) # Star
                
        else:
            total_steps = 52
            segment_size = 13
            order = ['RED', 'GREEN', 'YELLOW', 'BLUE']
            offsets = {c: i * segment_size for i, c in enumerate(order)}
            safe_indices = [0, 8, 13, 21, 26, 34, 39, 47]

        # offsets = {'RED': 0, 'GREEN': 13, 'YELLOW': 26, 'BLUE': 39}
        if player_color not in offsets: return # Should not happen
        
        global_pos = (piece_pos + offsets[player_color]) % total_steps
        
        # Check if safe square
        if global_pos in safe_indices:
            return
            
        # Check other players
        for p in state['players'].values():
            if p['side'] == player_color: continue
            if p['side'] not in offsets: continue # Paranoia
            
            for i, other_pos in enumerate(p['pieces']):
                if 0 <= other_pos < total_steps:
                    other_global = (other_pos + offsets[p['side']]) % total_steps
                    if other_global == global_pos:
                        # CAPTURE!
                        p['pieces'][i] = -1 # Send to base
                        # Initial player gets another turn? (Standard rules say yes, but keeping simple for now)
                        # To implement "Capture Bonus Turn", we'd need to modify next_turn logic.
                        # For now, let's just capture.



    @database_sync_to_async
    def update_dice_state(self, player, value):
        room = Room.objects.get(code=self.room_code)
        state = room.game_state
        if room.game_type == 'LUDO':
            if state['turn'] != player or state.get('phase', 'ROLL') != 'ROLL':
                return False
            
            state['dice_value'] = value
            state['phase'] = 'MOVE'
            
            # Auto-pass if no moves possible
            # Auto-pass if no moves possible
            if not self.has_valid_moves(state, player, value):
                 # Set phase to 'AUTO_PASS'
                 state['phase'] = 'AUTO_PASS' 
                 # We DO NOT spawn task here. We rely on the caller (roll_dice) to check state and spawn task.
                 # purely sync DB update here.
            
            room.save()
            return True
        elif room.game_type == 'SNAKES_AND_LADDERS':
            if state['turn'] != player or state.get('phase', 'ROLL') != 'ROLL':
                return False
            state['dice_value'] = value
            state['phase'] = 'MOVE'
            room.save()
            return True
        return False
        
        return False
        
    async def delayed_pass(self, room_code):
        import asyncio
        await asyncio.sleep(2)
        try:
            room = await database_sync_to_async(Room.objects.get)(code=room_code)
            state = room.game_state
            if state.get('phase') == 'AUTO_PASS':
                # Re-check valid moves? No, just pass.
                
                # Check consecutive sixes reset happens in next_turn
                self.next_turn(state)
                await database_sync_to_async(room.save)()
                
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {'type': 'game_update', 'game_state': state}
                )
                
                # Trigger bot loop
                await self.trigger_bot_if_needed()
                
                # Also save again if check_bot_turn modified something (it doesn't directly, it launches task)
                return True
        except Exception as e:
            print(f"Error in delayed_pass: {e}")
        return False
        
    def has_valid_moves(self, state, player, dice_val):
        # Find player data
        p_data = None
        for p in state['players'].values():
            if p['side'] == player:
                p_data = p
                break
        if not p_data: return False
        
        pieces = p_data['pieces']
        for p_idx, pos in enumerate(pieces):
            if pos == -1:
                if dice_val == 6: return True # Can leave base
            elif pos == 57:
                continue # Already home
            else:
                if pos + dice_val <= 57: return True
        return False

    def next_turn(self, state):
        base_colors = ['RED', 'GREEN', 'YELLOW', 'BLUE', 'ORANGE', 'PURPLE', 'CYAN', 'PINK']
        is_8_player = any(p['side'] in base_colors[4:] for p in state['players'].values()) or len(state['players']) > 4
        colors = base_colors if is_8_player else base_colors[:4]
        

        # Check if current player gets another turn (rolled 6)
        # But maybe limit to 3 times? (Not implemented for simplicity yet, unless requested)
        if state['dice_value'] == 6 and state.get('consecutive_sixes', 0) < 2 and state['winner'] is None:
             state['phase'] = 'ROLL'
             state['consecutive_sixes'] = state.get('consecutive_sixes', 0) + 1
             # Bot trigger is handled by caller checking state
             return

        # Next player
        state['consecutive_sixes'] = 0

        active_sides = [p['side'] for p in state['players'].values() if p['side'] in colors]
        # Sort by standard order
        active_sides.sort(key=lambda x: colors.index(x))

        if not active_sides:
            state['turn'] = 'RED' # Fallback
            return

        try:
            current_side = state['turn']
            if current_side in active_sides:
                idx = active_sides.index(current_side)
                next_side = active_sides[(idx + 1) % len(active_sides)]
            else:
                 # Current turn holder maybe left or invalid? Start from first active.
                 next_side = active_sides[0]

            state['turn'] = next_side
            state['phase'] = 'ROLL'
            state['dice_value'] = 0

            # Bot trigger handled by caller


        except Exception as e:
            print(f"Error in next_turn: {e}")
            state['turn'] = active_sides[0]
            state['phase'] = 'ROLL'

    async def trigger_bot_if_needed(self):
        state = await self.get_game_state()
        # Find player for turn
        for p in state['players'].values():
            if p['side'] == state['turn'] and p.get('is_bot'):
                # Trigger Bot
                import asyncio
                asyncio.create_task(self.run_bot_turn(state['turn']))
                break

    async def run_bot_turn(self, bot_color):
        import asyncio
        await asyncio.sleep(1) # Thinking time

        # Roll Dice
        import random
        dice_value = random.randint(1, 6)

        # We need to fetch FRESH state because async sleep released lock conceptually (though here we don't have lock)
        # But we need to save to DB.

        room = await database_sync_to_async(Room.objects.get)(code=self.room_code)
        state = room.game_state

        if state['turn'] != bot_color: return # State changed?

        # UPDATE STATE WITH ROLL
        state['dice_value'] = dice_value
        state['phase'] = 'MOVE'
        room.game_state = state
        await database_sync_to_async(room.save)()

        # Notify Frontend
        await self.channel_layer.group_send(
            self.room_group_name,
            {'type': 'game_update', 'game_state': state}
        )

        await asyncio.sleep(1) # Animation time

        # DECIDE MOVE
        moves = [] # (piece_idx, score)

        p_data = None
        for p in state['players'].values():
            if p['side'] == bot_color:
                p_data = p
                break

        if not p_data: return

        pieces = p_data['pieces']
        for idx, pos in enumerate(pieces):
             if pos == -1:
                 if dice_value == 6:
                     moves.append((idx, 100)) # High priority to leave base
             elif pos == 57:
                 continue
             elif pos + dice_value <= 57:
                 # Calculate Score
                 score = 10 # Base move score
                 new_pos = pos + dice_value
                 if new_pos == 57: score += 500 # WIN piece

                 # Capture logic (simplified check)
                 # We need full collision check logic here, duplication is bad but fast for now.
                 if self.is_capture(state, bot_color, new_pos):
                     score += 200

                 # Safe spot
                 offsets = {'RED': 0, 'GREEN': 13, 'YELLOW': 26, 'BLUE': 39}
                 global_pos = (new_pos + offsets[bot_color]) % 52
                 if global_pos in [0, 8, 13, 21, 26, 34, 39, 47]:
                     score += 50

                 moves.append((idx, score))

        # EXECUTE MOVE
        if moves:
            # Pick best
            moves.sort(key=lambda x: x[1], reverse=True)
            best_idx = moves[0][0]
            await self.update_game_state(best_idx, bot_color)

            # Send Update
            # Get fresh state again? update_game_state saves it.
            room = await database_sync_to_async(Room.objects.get)(code=self.room_code)
            await self.channel_layer.group_send(
                self.room_group_name,
                {'type': 'game_update', 'game_state': room.game_state}
            )
            
            # Chain Next Bot
            await self.trigger_bot_if_needed()
        else:
            # No moves
            await asyncio.sleep(1)
            
            # Reread fresh state
            room = await database_sync_to_async(Room.objects.get)(code=self.room_code)
            self.next_turn(room.game_state)
            await database_sync_to_async(room.save)()

            await self.channel_layer.group_send(
                self.room_group_name,
                {'type': 'game_update', 'game_state': room.game_state}
            )
            
            # Chain Next Bot
            await self.trigger_bot_if_needed()

    def is_capture(self, state, player_color, piece_pos):
        if piece_pos > 51: return False # Home stretch safe
        offsets = {'RED': 0, 'GREEN': 13, 'YELLOW': 26, 'BLUE': 39}
        global_pos = (piece_pos + offsets[player_color]) % 52
        if global_pos in [0, 8, 13, 21, 26, 34, 39, 47]: return False

        for p in state['players'].values():
            if p['side'] == player_color: continue
            for other_pos in p['pieces']:
                if 0 <= other_pos < 52:
                    other_global = (other_pos + offsets[p['side']]) % 52
                    if other_global == global_pos:
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
            
            # Alternate starting turn
            current_start = state.get('starting_turn', 'X')
            new_start = 'O' if current_start == 'X' else 'X'
            state['starting_turn'] = new_start
            state['turn'] = new_start
            print(f"DEBUG: Resetting game. Old start: {current_start}, New start: {new_start}")

        elif room.game_type == 'LUDO':
            state['winner'] = None
            state['dice_value'] = 0
            state['turn'] = 'RED'
        elif room.game_type == 'SNAKES_AND_LADDERS':
            state['winner'] = None
            state['dice_value'] = 0
            state['turn'] = 'RED'
            for p in state['players'].values():
                p['pos'] = 0
        room.save()
        return True

    def check_winner(self, board, player):
        win_conditions = [
            (0, 1, 2), (3, 4, 5), (6, 7, 8),
            (0, 3, 6), (1, 4, 7), (2, 5, 8),
            (0, 4, 8), (2, 4, 6)
        ]
        return any(all(board[i] == player for i in condition) for condition in win_conditions)

    def next_turn_sl(self, state):
        colors = ['RED', 'GREEN', 'YELLOW', 'BLUE']
        active_sides = [p['side'] for p in state['players'].values() if p['side'] in colors]
        active_sides.sort(key=lambda x: colors.index(x))
        
        if not active_sides: return
        
        if state['dice_value'] == 6 and state['winner'] is None:
             state['phase'] = 'ROLL' # Another turn for 6
             return

        idx = active_sides.index(state['turn'])
        state['turn'] = active_sides[(idx + 1) % len(active_sides)]
        state['phase'] = 'ROLL'
        state['dice_value'] = 0
