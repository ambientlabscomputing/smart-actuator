import typer
from cad.commands import ui

objects = typer.Typer()


@objects.command("list", help="List all registered CAD objects")
def list_objects():
    from cad.registry import registry

    objects = registry().get("objects", {})
    ui.print_table(
        data=[
            {
                "Name": name, 
                "Class": data["class"].__name__,
                "Params": ", ".join(data.get("params", {}).keys()),
            } for name, data in objects.items()
        ]
    )
