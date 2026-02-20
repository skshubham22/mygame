from django.db import models
import random
import string

class Room(models.Model):
    GAME_TYPES = (
        ('TIC_TAC_TOE', 'Tic Tac Toe'),
        ('LUDO', 'Ludo'),
    )
    
    code = models.CharField(max_length=8, unique=True, blank=True)
    game_type = models.CharField(max_length=20, choices=GAME_TYPES, default='TIC_TAC_TOE')
    mode = models.CharField(max_length=20, default='ONLINE') # ONLINE, COMPUTER, LOCAL
    player_count = models.IntegerField(default=2) # 2, 3, 4
    created_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)
    
    # Store game state as JSON (simplifies handling different game types)
    # For Tic-Tac-Toe: {'board': [null]*9, 'turn': 'X', 'winner': null}
    game_state = models.JSONField(default=dict, blank=True)

    def save(self, *args, **kwargs):
        if not self.code:
            self.code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
        
        if not self.game_state or 'players' not in self.game_state:
            if self.game_type == 'TIC_TAC_TOE':
                self.game_state = {
                    'board': [None] * 9,
                    'turn': 'X',
                    'starting_turn': 'X',
                    'winner': None,
                    'players': {} 
                }
            elif self.game_type == 'LUDO':
                # Positions: -1 = Base, 0-51 = Main Path, 52-56 = Home Stretch, 57 = Home
                self.game_state = {
                    'players': {}, # session_key: {color: 'RED', pieces: [-1, -1, -1, -1], score: 0, name: ''}
                    'turn': 'RED', # RED, GREEN, YELLOW, BLUE
                    'dice_value': 0,
                    'phase': 'ROLL', # ROLL or MOVE
                    'winner': None,
                    'consecutive_sixes': 0,
                    'last_moved_piece': None
                }
        
        super().save(*args, **kwargs)

    @property
    def is_expired(self):
        from django.utils import timezone
        import datetime
        expiration_time = self.created_at + datetime.timedelta(minutes=5)
        return timezone.now() > expiration_time

    def __str__(self):
        return f"{self.game_type} - {self.code}"

