from flask import Flask, render_template
app = Flask(__name__, template_folder='./templates')

@app.route('/')
def preview_template():
    # Mock the variables that Synapse would provide
    mock_data = {
        'server_name': 'matrix.app.codecollective.us',
        'sso_user': {
            'localpart': 'testuser',
            'display_name': 'Test User',
            "user_profile":"dummy"
        },
        'idp': {
            'idp_name': 'KeyCloak server'
        },
        "user_profile":"dummy"
    }
    return render_template('sso_redirect_confirm.html', **mock_data)

if __name__ == '__main__':
    app.run(debug=True, host="0.0.0.0")