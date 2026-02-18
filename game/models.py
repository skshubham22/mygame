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
    created_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)
    
    # Store game state as JSON (simplifies handling different game types)
    # For Tic-Tac-Toe: {'board': [null]*9, 'turn': 'X', 'winner': null}
    game_state = models.JSONField(default=dict, blank=True)

    def save(self, *args, **kwargs):
        if not self.code:
            self.code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
        
        if not self.game_state:
            if self.game_type == 'TIC_TAC_TOE':
                self.game_state = {
                    'board': [None] * 9,
                    'turn': 'X',
                    'winner': None,
                    'players': {} 
                }
            elif self.game_type == 'LUDO':
                self.game_state = {
                    'players': {}, # session: {color: 'RED', pieces: [0,0,0,0], ...}
                    'turn': 'RED', # RED, GREEN, YELLOW, BLUE
                    'dice_value': 0,
                    'winner': None,
                    'board': {} # track piece positions if needed, or just calculate from pieces
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

