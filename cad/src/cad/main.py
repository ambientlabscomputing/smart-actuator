import typer
from cad.commands.export import export
from cad.commands.objects import objects

app = typer.Typer()
app.add_typer(export, name="export", help="Export commands")
app.add_typer(objects, name="objects", help="Object commands")

if __name__ == "__main__":
    app()
